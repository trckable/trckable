// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clientIP, getIds, proxy, checkoutFields, checkoutUrl, reportCrawler } from '../src/server'

afterEach(() => vi.restoreAllMocks())

function incoming(headers: Record<string, string> = {}, method = 'POST') {
  return new Request('https://site.com/api/e', {
    method,
    headers: { 'user-agent': 'Mozilla/5.0 Safari', 'x-real-ip': '79.106.125.62', ...headers },
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
      'x-trckable-client-ip': '79.106.125.62',
      'user-agent': 'Mozilla/5.0 Safari',
    })
    expect(init.body).toBe('{"s":"tkb_test","k":"pv"}')
  })

  it('never forwards a client IP without a proxy key (it would not be trusted anyway)', async () => {
    const upstream = vi.fn(async () => new Response(null, { status: 202 }))
    globalThis.fetch = upstream as any
    await proxy({ host: 'https://stats.site.com' })(incoming())
    expect((upstream.mock.calls[0] as any)[1].headers['x-trckable-client-ip']).toBeUndefined()
  })

  it('answers 503 when trckable is unreachable, so the tracker retries', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('connect ECONNREFUSED')
    }) as any
    const res = await proxy({ host: 'https://stats.site.com' })(incoming())
    expect(res.status).toBe(503)
    expect(res.headers.get('retry-after')).toBe('5')
  })

  it('rejects non-POST and explains a missing host', async () => {
    expect((await proxy({ host: 'https://x.com' })(incoming({}, 'GET'))).status).toBe(405)
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
})
