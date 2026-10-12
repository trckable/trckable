// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clientIP, getIds, proxy, scriptProxy, nodeHandler, checkoutFields, checkoutUrl, reportCrawler } from '../src/server'

afterEach(() => vi.restoreAllMocks())

function incoming(headers: Record<string, string> = {}, method = 'POST') {
  return new Request('https://site.com/api/e', {
    method,
    headers: { 'user-agent': 'Mozilla/5.0 Safari', 'x-real-ip': '80.78.64.1', ...headers },
    body: method === 'POST' ? '{"s":"tkb_test","k":"pv"}' : undefined,
  })
}

describe('proxy', () => {
  it('forwards the event with the proxy key and visitor IP, and passes the cookie back', async () => {
    const upstream = vi.fn(async () =>
      new Response(null, { status: 202, headers: { 'set-cookie': 'trckable_vid=abc.def; Path=/; Max-Age=34560000' } }),
    )
    globalThis.fetch = upstream as any
    const res = await proxy({ host: 'https://stats.site.com/', proxyKey: 'tkb_px_secret' })(incoming())

    expect(res.status).toBe(202)
    expect(res.headers.get('set-cookie')).toContain('trckable_vid=abc.def')
    const [url, init] = upstream.mock.calls[0] as any
    expect(url).toBe('https://stats.site.com/api/e')
    expect(init.headers).toMatchObject({
      'x-trckable-proxy-key': 'tkb_px_secret',
      'x-trckable-client-ip': '80.78.64.1',
      'user-agent': 'Mozilla/5.0 Safari',
    })
    expect(init.body).toBe('{"s":"tkb_test","k":"pv"}')
  })

  it('refuses to forward without a proxy key, saying what to set, and sends nothing', async () => {
    delete process.env.TRCKABLE_PROXY_KEY
    const upstream = vi.fn(async () => new Response(null, { status: 202 }))
    globalThis.fetch = upstream as any
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await proxy({ host: 'https://stats.site.com' })(incoming())
    expect(res.status).toBe(500)
    expect(await res.text()).toContain('TRCKABLE_PROXY_KEY')
    expect(upstream).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalled()
  })

  it('takes the key from the environment when none is passed', async () => {
    process.env.TRCKABLE_PROXY_KEY = 'tkb_px_env'
    const upstream = vi.fn(async () => new Response(null, { status: 202 }))
    globalThis.fetch = upstream as any
    expect((await proxy({ host: 'https://stats.site.com' })(incoming())).status).toBe(202)
    delete process.env.TRCKABLE_PROXY_KEY
  })

  it('passes Do Not Track and Global Privacy Control on, so the server can honour them', async () => {
    const upstream = vi.fn(async () => new Response(null, { status: 202 }))
    globalThis.fetch = upstream as any
    await proxy({ host: 'https://stats.site.com', proxyKey: 'tkb_px_k' })(incoming({ dnt: '1', 'sec-gpc': '1' }))
    expect((upstream.mock.calls[0] as any)[1].headers).toMatchObject({ dnt: '1', 'sec-gpc': '1' })
    await proxy({ host: 'https://stats.site.com', proxyKey: 'tkb_px_k' })(incoming())
    expect((upstream.mock.calls[1] as any)[1].headers.dnt).toBeUndefined()
  })

  it('answers 503 when trckable is unreachable, so the tracker retries', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('connect ECONNREFUSED')
    }) as any
    const res = await proxy({ host: 'https://stats.site.com', proxyKey: 'tkb_px_k' })(incoming())
    expect(res.status).toBe(503)
    expect(res.headers.get('retry-after')).toBe('5')
  })

  it('rejects non-POST and explains a missing host', async () => {
    expect((await proxy({ host: 'https://x.com', proxyKey: 'tkb_px_k' })(incoming({}, 'GET'))).status).toBe(405)
    const res = await proxy({})(incoming())
    expect(res.status).toBe(500)
    expect(await res.text()).toContain('TRCKABLE_HOST')
  })
})

describe('clientIP', () => {
  it('prefers platform-set headers over X-Forwarded-For', () => {
    expect(clientIP(new Headers({ 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '9.9.9.9' }))).toBe('1.1.1.1')
    expect(clientIP(new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }))).toBe('203.0.113.9')
    expect(clientIP(new Headers())).toBeUndefined()
  })
})

describe('getIds', () => {
  it('reads the visitor id from a cookie header or a Next.js cookie store', () => {
    expect(getIds('a=1; trckable_vid=k3j2.m1a2b3; b=2')).toEqual({ trckable_vid: 'k3j2.m1a2b3' })
    expect(getIds({ get: (n) => (n === 'trckable_vid' ? { value: 'x.y' } : undefined) })).toEqual({ trckable_vid: 'x.y' })
    expect(getIds('a=1')).toEqual({})
    expect(getIds(null)).toEqual({})
  })
})

describe('next', () => {
  it('exports a ready-made POST route handler configured from env', async () => {
    process.env.TRCKABLE_HOST = 'https://stats.site.com'
    process.env.TRCKABLE_PROXY_KEY = 'tkb_px_env'
    const upstream = vi.fn(async () => new Response(null, { status: 202 }))
    globalThis.fetch = upstream as any
    const { POST } = await import('../src/next')
    expect((await POST(incoming())).status).toBe(202)
    expect((upstream.mock.calls[0] as any)[1].headers['x-trckable-proxy-key']).toBe('tkb_px_env')
  })
})

describe('checkout attribution helpers', () => {
  const ids = { trckable_vid: 'abc123.m1a2b3' }
  it('builds provider checkout fields', () => {
    expect(checkoutFields('stripe', ids, 'subscription')).toEqual({ metadata: ids, subscription_data: { metadata: ids } })
    expect(checkoutFields('stripe', ids)).toEqual({ metadata: ids, payment_intent_data: { metadata: ids } })
    expect(checkoutFields('lemonsqueezy', ids)).toEqual({ checkout_data: { custom: ids } })
    expect(checkoutFields('paddle', ids)).toEqual({ custom_data: ids })
    expect(checkoutFields('polar', ids)).toEqual({ metadata: ids })
    expect(checkoutFields('dodo', {})).toEqual({}) // no visitor (cookieless): nothing to add
  })
  it('decorates hosted checkout links like the browser script', () => {
    expect(checkoutUrl('https://buy.stripe.com/abc', ids)).toBe('https://buy.stripe.com/abc?client_reference_id=trckable_abc123_m1a2b3')
    expect(checkoutUrl('https://buy.polar.sh/polar_cl_1', ids)).toBe('https://buy.polar.sh/polar_cl_1?reference_id=trckable_abc123_m1a2b3')
    expect(checkoutUrl('https://example.com/buy', ids)).toBe('https://example.com/buy')
  })
})

describe('reportCrawler', () => {
  it('reports robots, ignores people, and never throws', async () => {
    const calls: { url: string; body: unknown }[] = []
    const original = globalThis.fetch
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) })
      return new Response(null, { status: 202 })
    }) as typeof fetch
    try {
      const base = { host: 'https://stats.example.com', site: 'tkb_x', key: 'tkb_px_1', url: 'https://example.com/docs' }
      reportCrawler({ ...base, ua: 'Mozilla/5.0 (compatible; GPTBot/1.2)' })
      reportCrawler({ ...base, ua: 'Mozilla/5.0 (Macintosh) Chrome/140 Safari/537.36' }) // a person
      reportCrawler({ ...base, ua: null }) // nothing to report
      reportCrawler({ ...base, key: undefined, ua: 'GPTBot/1.2' }) // no key: stay quiet
      await Promise.resolve()

      expect(calls).toHaveLength(1)
      expect(calls[0].url).toBe('https://stats.example.com/api/crawl')
      expect(calls[0].body).toMatchObject({ s: 'tkb_x', u: 'https://example.com/docs' })
    } finally {
      globalThis.fetch = original
    }
  })

  it('lets through every robot the server counts', async () => {
    const sent: string[] = []
    const original = globalThis.fetch
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)).ua)
      return new Response(null, { status: 202 })
    }) as typeof fetch
    try {
      const uas = ['ChatGPT-User/1.0', 'OAI-SearchBot/1.0', 'Claude-User/1.0', 'ClaudeBot/1.0', 'anthropic-ai', 'PerplexityBot/1.0', 'Perplexity-User/1.0',
        'CCBot/2.0', 'Bytespider', 'meta-externalagent/1.1', 'cohere-ai', 'MistralAI-User/1.0', 'omgili/0.5', 'Applebot/0.1', 'Googlebot/2.1']
      for (const ua of uas) reportCrawler({ host: 'https://stats.example.com', site: 'tkb_x', key: 'k', url: 'https://example.com/', ua })
      await Promise.resolve()
      expect(sent).toEqual(uas)
    } finally {
      globalThis.fetch = original
    }
  })
})

describe('scriptProxy', () => {
  const get = (method = 'GET') => new Request('https://site.com/s/x.js', { method })

  it('serves the script from your server with a cache header', async () => {
    const upstream = vi.fn(async () => new Response('(()=>{})()', { status: 200, headers: { 'content-type': 'text/plain' } }))
    globalThis.fetch = upstream as any
    const res = await scriptProxy({ host: 'https://stats.site.com/' })(get())
    expect((upstream.mock.calls[0] as any)[0]).toBe('https://stats.site.com/js/t.js')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('javascript')
    expect(res.headers.get('cache-control')).toContain('max-age=3600')
    expect(await res.text()).toBe('(()=>{})()')
  })

  it('answers HEAD without a body, refuses other methods, and needs a host', async () => {
    globalThis.fetch = vi.fn(async () => new Response('x')) as any
    expect((await scriptProxy({ host: 'https://h.com' })(get('HEAD'))).body).toBeNull()
    expect((await scriptProxy({ host: 'https://h.com' })(get('POST'))).status).toBe(405)
    delete process.env.TRCKABLE_HOST
    expect((await scriptProxy()(get())).status).toBe(500)
  })

  it('answers 502 when your server is away or answers badly', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('down') }) as any
    expect((await scriptProxy({ host: 'https://h.com' })(get())).status).toBe(502)
    globalThis.fetch = vi.fn(async () => new Response('no', { status: 500 })) as any
    expect((await scriptProxy({ host: 'https://h.com' })(get())).status).toBe(502)
  })
})

describe('nodeHandler', () => {
  function fake(method: string, url: string, chunks: (string | Uint8Array)[], headers: Record<string, string | string[]> = {}) {
    return {
      method,
      url,
      headers: { host: 'site.com', ...headers },
      async *[Symbol.asyncIterator]() {
        for (const c of chunks) yield c
      },
    }
  }
  function sink() {
    const out = { statusCode: 0, headers: {} as Record<string, unknown>, body: new Uint8Array(), setHeader(k: string, v: unknown) { this.headers[k] = v }, end(b?: Uint8Array) { this.body = b ?? new Uint8Array() } }
    return out
  }

  it('turns a node request into a Request and writes the answer back, cookies included', async () => {
    let seen: Request | undefined
    let text = ''
    const handler = nodeHandler(async (req) => {
      seen = req
      text = await req.text()
      const res = new Response('hi', { status: 202, headers: { 'x-a': '1' } })
      res.headers.append('set-cookie', 'a=1')
      res.headers.append('set-cookie', 'b=2')
      return res
    })
    const res = sink()
    await handler(fake('POST', '/s/e', ['{"a":', new TextEncoder().encode('1}')], { 'x-multi': ['p', 'q'] }) as any, res as any)
    expect(seen?.url).toBe('http://site.com/s/e')
    expect(seen?.headers.get('x-multi')).toBe('p, q')
    expect(text).toBe('{"a":1}')
    expect(res.statusCode).toBe(202)
    expect(res.headers['x-a']).toBe('1')
    expect(res.headers['set-cookie']).toEqual(['a=1', 'b=2'])
    expect(new TextDecoder().decode(res.body)).toBe('hi')
  })

  it('sends no body with GET and defaults the method and host', async () => {
    let seen: Request | undefined
    const res = sink()
    await nodeHandler(async (req) => ((seen = req), new Response(null, { status: 204 })))({ headers: {}, async *[Symbol.asyncIterator]() {} } as any, res as any)
    expect(seen?.method).toBe('GET')
    expect(seen?.url).toBe('http://localhost/')
    expect(res.statusCode).toBe(204)
    expect(res.headers['set-cookie']).toBeUndefined()
  })
})

describe('nodeHandler and the visitor address', () => {
  const spoofed = {
    'x-real-ip': '6.6.6.6',
    'x-forwarded-for': '6.6.6.6',
    forwarded: 'for=6.6.6.6',
    'cf-connecting-ip': '6.6.6.6',
    'true-client-ip': '6.6.6.6',
    'x-nf-client-connection-ip': '6.6.6.6',
    'fly-client-ip': '6.6.6.6',
    'x-trckable-client-ip': '6.6.6.6',
  }
  const run = async (req: Record<string, unknown>) => {
    let seen: Headers | undefined
    await nodeHandler(async (r) => ((seen = r.headers), new Response(null, { status: 204 })))(
      { method: 'POST', url: '/s/e', headers: { host: 'site.com', ...spoofed }, async *[Symbol.asyncIterator]() {}, ...req } as any,
      { setHeader() {}, end() {}, statusCode: 0 } as any,
    )
    return seen!
  }

  it('ignores every address header the visitor sent and uses the connection', async () => {
    const h = await run({ socket: { remoteAddress: '203.0.113.9' } })
    expect(h.get('x-real-ip')).toBe('203.0.113.9')
    for (const name of Object.keys(spoofed).filter((n) => n !== 'x-real-ip')) expect(h.get(name)).toBeNull()
  })

  it('prefers the address Express worked out, which follows its trust proxy setting', async () => {
    expect((await run({ ip: '198.51.100.4', socket: { remoteAddress: '10.0.0.1' } })).get('x-real-ip')).toBe('198.51.100.4')
  })

  it('names no address when there is none, rather than the visitor\'s claim', async () => {
    const h = await run({})
    expect(h.get('x-real-ip')).toBeNull()
  })

  it('forwards only the address it chose through proxy()', async () => {
    const upstream = vi.fn(async () => new Response(null, { status: 202 }))
    globalThis.fetch = upstream as any
    const p = proxy({ host: 'https://stats.site.com', proxyKey: 'tkb_px_k' })
    await nodeHandler(p)({ method: 'POST', url: '/s/e', headers: { host: 'site.com', 'cf-connecting-ip': '6.6.6.6' }, socket: { remoteAddress: '203.0.113.9' }, async *[Symbol.asyncIterator]() { yield '{}' } } as any, { setHeader() {}, end() {}, statusCode: 0 } as any)
    expect((upstream.mock.calls[0] as any)[1].headers['x-trckable-client-ip']).toBe('203.0.113.9')
  })
})

describe('proxy target', () => {
  it('sends heatmap reports to /api/h', async () => {
    const upstream = vi.fn(async () => new Response(null, { status: 202 }))
    globalThis.fetch = upstream as any
    await proxy({ host: 'https://stats.site.com', proxyKey: 'tkb_px_k', target: 'heat' })(incoming())
    expect((upstream.mock.calls[0] as any)[0]).toBe('https://stats.site.com/api/h')
  })
})
