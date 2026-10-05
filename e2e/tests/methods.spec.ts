// Every install method in the dashboard, run as written: each snippet comes
// straight from dashboard/src/lib/install.ts with this site's id, goes on a
// page at http://example.com (served by the browser's router, so the page
// has a real domain), and the test waits for its pageview to arrive at
// trckable through /api/v1. Nothing is retyped here: a snippet that stops
// counting fails this file.
//
// How each one runs, precisely:
//   as given     the snippet is the page's <head>, byte for byte
//   php          WordPress: the snippet is run by PHP with add_action
//                stubbed, and what wp_head prints is the <head>
//   react-ssr    Remix and Gatsby: the JSX is compiled and rendered by
//                react-dom/server; the markup it gives is the <head>
//   config       Nuxt and Docusaurus: the config object is evaluated and
//                written out as a tag, attribute for attribute, which is what
//                both frameworks do with it (the frameworks are not built)
//   gtm          Google Tag Manager: the Custom HTML is inserted the way
//                GTM does, by re-creating its script elements in <head>
//   bundled      React, Next.js, Vue, Svelte, apps: the emitted import and
//                call are bundled with the package's build (esbuild) and run
//                in the page; Next's route is the package's own POST, run
//                here with the emitted environment variables
//   route        Hono & co: the emitted handler code is run here and serves
//                the page's /api/e
//   nginx        the emitted locations, read and followed (not nginx itself)
//   curl         the emitted command, run by the shell
//
// trckable is at http://stats.example.com, through the forward proxy in
// serve.mjs (the browsers', and curl's through http_proxy; the package's
// handlers run in this process, whose fetch is pointed the same way).
// Automation is ignored by the tracker unless data-dev is set, and the
// snippets must stay exactly as written, so navigator.webdriver is hidden
// instead. Everything else is the browsers' own.
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from './fixtures'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { METHODS, tag, type Ctx, type Method } from '../../dashboard/src/lib/install'
import { API, TOKEN } from '../playwright.config'

const PKG = fileURLToPath(new URL('../../packages/trckable/', import.meta.url))
const pkgRequire = createRequire(PKG + 'package.json')
const esbuild = pkgRequire('esbuild') as typeof import('esbuild')
const auth = { Authorization: `Bearer ${TOKEN}` }
const PROXY = 'http://127.0.0.1:18302'
const HOST = 'http://stats.example.com'
const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

let site = ''
let key = ''
test.beforeAll(async ({ request }) => {
  const s = await (await request.get('/_site')).json()
  site = s.site
  key = s.key
})

const ctxFor = (domain = 'example.com'): Ctx => ({ host: HOST, site, domain, proxyKey: key })

// This process has no forward proxy: its fetch sends stats.example.com to trckable.
const realFetch = globalThis.fetch
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  realFetch(typeof input === 'string' || input instanceof URL ? String(input).replace(HOST, API) : input, init)) as typeof fetch
const runId = (id: string, browser: string) => `${id}-${browser}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

type Ev = { kind: string; path: string; hostname: string }
async function pageviews(request: APIRequestContext, prefix: string, host = 'example.com'): Promise<Ev[]> {
  const r = await request.get(`${API}/api/v1/sites/${site}/events?limit=1000&path_prefix=${encodeURIComponent(prefix)}`, { headers: auth })
  expect(r.ok()).toBeTruthy()
  return ((await r.json()).events as Ev[]).filter((e) => e.kind === 'pageview' && e.hostname === host)
}

async function counted(request: APIRequestContext, prefix: string, host?: string) {
  await expect.poll(async () => (await pageviews(request, prefix, host)).length, { timeout: 20_000 }).toBeGreaterThan(0)
}

async function visitorContext(browser: import('@playwright/test').Browser): Promise<BrowserContext> {
  const context = await browser.newContext({ proxy: { server: PROXY } })
  await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }))
  return context
}

const doc = (head: string, body = '') =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>install</title>\n${head}\n</head><body><h1>installed</h1><div id="root"></div>${body}</body></html>`

/** Opens http://example.com/m/<run> with this document, and anything else
 *  the page asks example.com for from `extra`. */
async function open(context: BrowserContext, run: string, html: string, extra?: (url: URL, page: Page) => Promise<Response | null>) {
  const page = await context.newPage()
  await page.route('http://example.com/**', async (r) => {
    const url = new URL(r.request().url())
    if (url.pathname === `/m/${run}`) return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
    const out = extra && (await extra(url, page))
    if (!out) return r.fulfill({ status: 404, body: '' })
    const headers: Record<string, string> = {}
    out.headers.forEach((v, k) => (headers[k] = v))
    return r.fulfill({ status: out.status, headers, body: Buffer.from(await out.arrayBuffer()) })
  })
  await page.goto(`http://example.com/m/${run}`)
  return page
}

/** A request the page made, as a fetch Request, for the package's handlers. */
async function asRequest(url: URL, route: import('@playwright/test').Request): Promise<Request> {
  const headers = new Headers(await route.allHeaders())
  headers.set('x-real-ip', '127.0.0.1') // what the platform's edge adds
  return new Request(url, { method: route.method(), headers, body: route.method() === 'POST' ? route.postDataBuffer() : undefined })
}

// ---- turning each snippet into the <head> a browser gets ----

const tagOnly = (m: Method, c: Ctx) => m.code(c) === tag(c)

function part(code: string, from: string, to?: string) {
  const i = code.indexOf(from)
  expect(i, `snippet has "${from}"`).toBeGreaterThanOrEqual(0)
  const rest = code.slice(i + from.length)
  return to ? rest.slice(0, rest.indexOf(to)) : rest
}

function react() {
  const React = pkgRequire('react')
  const { renderToStaticMarkup } = pkgRequire('react-dom/server')
  return { React, renderToStaticMarkup }
}

const jsx = (code: string) => esbuild.transformSync(code, { loader: 'jsx', format: 'cjs', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment' }).code

/** Writes a config's script object as the tag the framework renders. */
function configTag(o: Record<string, string | boolean>) {
  const attrs = Object.entries(o).map(([k, v]) => (v === true ? k : `${k}="${v}"`))
  return `<script ${attrs.join(' ')}></script>`
}

let php: boolean | undefined
function hasPhp() {
  if (php === undefined) {
    try {
      execFileSync('php', ['-v'], { stdio: 'ignore' })
      php = true
    } catch {
      php = false
    }
  }
  return php
}

const HEADS: Record<string, (m: Method, c: Ctx) => string> = {
  landing: (m, c) => part(m.code(c), '<!-- landing page, in <head> -->\n', '\n\n'),
  svelte: (m, c) => part(m.code(c), '<!-- src/app.html, inside <head> -->\n', '\n\n'),
  lovable: (m, c) => part(m.code(c), 'Add this to index.html inside <head>:\n\n'),
  astro: (m, c) => {
    const code = m.code(c)
    expect(code).toMatch(/^---\n[\s\S]*?\n---\n<head>/)
    return part(part(code, '\n---\n'), '<head>', '</head>')
  },
  remix: (m, c) => {
    const { React, renderToStaticMarkup } = react()
    const Meta = () => null
    const Links = () => null
    const el = new Function('React', 'Meta', 'Links', 'module', jsx('module.exports = (\n' + m.code(c) + '\n)') + '; return module.exports')(React, Meta, Links, {})
    return part(renderToStaticMarkup(el), '<head>', '</head>')
  },
  gatsby: (m, c) => {
    const { React, renderToStaticMarkup } = react()
    const exp: { onRenderBody?: (a: { setHeadComponents: (x: unknown[]) => void }) => void } = {}
    new Function('React', 'exports', jsx(m.code(c)))(React, exp)
    let head = ''
    exp.onRenderBody!({ setHeadComponents: (els) => (head = els.map((e) => renderToStaticMarkup(e)).join('')) })
    return head
  },
  docusaurus: (m, c) => {
    const cfg = new Function(`return ({${part(m.code(c), '// docusaurus.config.js\n')}})`)()
    return cfg.scripts.map(configTag).join('\n')
  },
  wordpress: (m, c) => {
    const dir = mkdtempSync(join(tmpdir(), 'trckable-wp-'))
    writeFileSync(join(dir, 'snippet.php'), m.code(c))
    writeFileSync(
      join(dir, 'run.php'),
      `<?php $h = []; function add_action($n, $f) { global $h; $h[$n][] = $f; } include __DIR__ . '/snippet.php'; foreach ($h['wp_head'] as $f) $f();`,
    )
    return execFileSync('php', [join(dir, 'run.php')]).toString()
  },
}

// Nuxt's half of the Vue method: the config's script objects, written out.
const nuxtHead = (m: Method, c: Ctx) => {
  const cfg = new Function(`return ({${part(m.code(c), '// or nuxt.config.ts\n')}})`)()
  return cfg.app.head.script.map(configTag).join('\n')
}

// ---- tag and head methods: every browser ----

const HEAD_METHODS = METHODS.filter((m) => tagOnly(m, ctxFor()) || HEADS[m.id] || m.id === 'gtm')

for (const m of HEAD_METHODS) {
  test(`${m.name}: the snippet's pageview arrives`, async ({ browser, request, browserName }) => {
    if (m.id === 'wordpress' && !hasPhp()) {
      expect(process.env.CI, 'CI must run WordPress through PHP').toBeFalsy()
      test.skip(true, 'php is not installed here (CI has it)')
    }
    const run = runId(m.id, browserName)
    const c = ctxFor()
    let head: string
    let body = ''
    if (m.id === 'gtm') {
      // GTM's Custom HTML tag: parsed, then each script element re-created.
      head = ''
      body = `<script>(function(){var t=document.createElement('template');t.innerHTML=${JSON.stringify(m.code(c)).replace(/</g, '\\u003c')};t.content.querySelectorAll('script').forEach(function(o){var s=document.createElement('script');for(var i=0;i<o.attributes.length;i++)s.setAttribute(o.attributes[i].name,o.attributes[i].value);document.head.appendChild(s)})})()</script>`
    } else head = HEADS[m.id] ? HEADS[m.id](m, c) : m.code(c)
    // Whatever the route, the page gets the site's id and its domain.
    expect(head + body).toContain(`data-site=${m.id === 'gtm' ? '\\"' : '"'}${site}`)
    expect(head + body).toContain('example.com')
    const context = await visitorContext(browser)
    await open(context, run, doc(head, body))
    await counted(request, `/m/${run}`)
    await context.close()
  })
}

test('Vue & Nuxt: nuxt.config’s script object, written out, counts', async ({ browser, request, browserName }) => {
  const m = METHODS.find((x) => x.id === 'vue')!
  const run = runId('nuxt', browserName)
  const head = nuxtHead(m, ctxFor())
  expect(head).toContain(`data-site="${site}"`)
  expect(head).toContain('data-domain="example.com"')
  const context = await visitorContext(browser)
  await open(context, run, doc(head))
  await counted(request, `/m/${run}`)
  await context.close()
})

// ---- bundled: the emitted code, bundled with the package build ----

async function bundle(entry: string): Promise<string> {
  const out = await esbuild.build({
    stdin: { contents: entry, loader: 'tsx', resolveDir: PKG },
    bundle: true,
    write: false,
    format: 'esm',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'trckable',
        setup(b) {
          b.onResolve({ filter: /^trckable(\/(react|next|server))?$/ }, (a) => ({ path: join(PKG, 'dist', (a.path.split('/')[1] ?? 'index') + '.js') }))
        },
      },
    ],
  })
  return out.outputFiles[0].text
}

/** The import and the component line of a step, rendered at the root. */
const component = (step: string) => {
  const [imp, el] = step.split('\n')
  return `${imp}\nimport { createRoot } from 'react-dom/client'\ncreateRoot(document.getElementById('root')!).render(<>${el}</>)\n`
}

// init() in plain JavaScript: the emitted lines, as they are.
const initLines = (code: string) => code.split('\n').filter((l) => /^import \{ init \} from 'trckable'$|^init\(/.test(l)).join('\n')

const BUNDLED: Record<string, (m: Method, c: Ctx) => string> = {
  react: (m, c) => component(m.steps!(c)[1].code),
  vue: (m, c) => initLines(part(m.code(c), '// main.ts\n', '\n\n')),
  svelte: (m, c) => initLines(part(m.code(c), '<!-- or, bundled: -->\n')),
  app: (m, c) => m.code(c),
}

for (const [id, entry] of Object.entries(BUNDLED)) {
  const m = METHODS.find((x) => x.id === id)!
  test(`${m.name}: the emitted code, bundled with the package, counts`, async ({ browser, request, browserName }) => {
    const run = runId(id, browserName)
    const c = ctxFor()
    const src = entry(m, c)
    expect(src).toContain(site)
    const js = await bundle(src)
    const context = await visitorContext(browser)
    await open(context, run, doc('<script type="module" src="/_bundle.js"></script>'), async (url) =>
      url.pathname === '/_bundle.js' ? new Response(js, { headers: { 'content-type': 'text/javascript' } }) : null,
    )
    await counted(request, `/m/${run}`)
    await context.close()
  })
}

// Next.js: the component in the page, and app/api/e/route.ts's POST from the
// package, configured by the emitted .env lines. The landing-page method is
// the tag above plus these same steps.
test('Next.js: <Analytics />, the route and the two variables count, through your own domain', async ({ browser, request, browserName }) => {
  const m = METHODS.find((x) => x.id === 'next')!
  const run = runId('next', browserName)
  const c = ctxFor()
  const [, layout, route, env] = m.steps!(c).map((s) => s.code)
  expect(route).toContain("export { POST } from 'trckable/next'")
  for (const line of env.split('\n').filter((l) => /^[A-Z_]+=/.test(l))) {
    const [k, v] = line.split('=')
    process.env[k] = v
  }
  expect(process.env.TRCKABLE_PROXY_KEY).toBe(key)
  const { POST } = await import(join(PKG, 'dist', 'next.js'))
  const js = await bundle(component(layout))
  const context = await visitorContext(browser)
  const page = await context.newPage()
  await page.route('http://example.com/**', async (r) => {
    const url = new URL(r.request().url())
    if (url.pathname === `/m/${run}`) return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: doc('<script type="module" src="/_bundle.js"></script>') })
    if (url.pathname === '/_bundle.js') return r.fulfill({ status: 200, contentType: 'text/javascript', body: js })
    if (url.pathname === '/api/e') {
      const out: Response = await POST(await asRequest(url, r.request()))
      const headers: Record<string, string> = {}
      out.headers.forEach((v, k) => (headers[k] = v))
      return r.fulfill({ status: out.status, headers, body: '' })
    }
    return r.fulfill({ status: 404, body: '' })
  })
  await page.goto(`http://example.com/m/${run}`)
  await counted(request, `/m/${run}`)
  // Through the route with the key: trckable set the cookie, on the site's domain
  // (the script's own host-only copy of the same id is there too, from the first event).
  await expect.poll(async () => (await context.cookies('http://example.com')).some((x) => x.name === 'trckable_vid' && x.domain === '.example.com')).toBe(true)
  await context.close()
})

// Hono & co: the emitted route code runs here, the emitted tag on the page.
test('Hono, Bun, Deno, Workers: the emitted route and tag count, through your own domain', async ({ browser, request, browserName }) => {
  const m = METHODS.find((x) => x.id === 'node')!
  const run = runId('node', browserName)
  const c = ctxFor()
  const code = m.code(c)
  const route = part(code, '// the route: any handler that takes a Request\n', '\n\n# .env')
  const env = part(code, '# .env\n', '\n\n')
  const head = part(code, '<!-- every page, in <head> -->\n')
  process.env.TRCKABLE_PROXY_KEY = env.split('=')[1]
  const { proxy } = await import(join(PKG, 'dist', 'server.js'))
  let handler: ((c: { req: { raw: Request } }) => Promise<Response>) | undefined
  const app = { post: (path: string, h: typeof handler) => path === '/api/e' && (handler = h) }
  new Function('proxy', 'app', 'process', route.replace("import { proxy } from 'trckable/server'", ''))(proxy, app, process)
  expect(handler).toBeTruthy()
  const context = await visitorContext(browser)
  const page = await context.newPage()
  await page.route('http://example.com/**', async (r) => {
    const url = new URL(r.request().url())
    if (url.pathname === `/m/${run}`) return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: doc(head) })
    if (url.pathname === '/api/e') {
      const out = await handler!({ req: { raw: await asRequest(url, r.request()) } })
      const headers: Record<string, string> = {}
      out.headers.forEach((v, k) => (headers[k] = v))
      return r.fulfill({ status: out.status, headers, body: '' })
    }
    return r.fulfill({ status: 404, body: '' })
  })
  await page.goto(`http://example.com/m/${run}`)
  await counted(request, `/m/${run}`)
  await context.close()
})

// Nginx: the emitted locations, followed as nginx would: /t.js is the site's
// script, /api/e goes upstream with the two headers.
test('Proxy on your own domain: the Nginx locations and the tag count', async ({ browser, request, browserName }) => {
  const m = METHODS.find((x) => x.id === 'proxy')!
  const run = runId('proxy', browserName)
  const c = ctxFor()
  const code = m.code(c)
  const loc = (path: string) => {
    const block = part(code, `location ${path} {\n`, '\n}')
    const pass = /proxy_pass (\S+);/.exec(block)![1]
    const headers = [...block.matchAll(/proxy_set_header (\S+) (\S+);/g)].map(([, k, v]) => [k, v.replace('$remote_addr', '127.0.0.1')])
    return { pass, headers }
  }
  const script = loc('/t.js')
  const events = loc('/api/e')
  const head = part(code, '<!-- every page, in <head>: the script and its events from your domain -->\n')
  const context = await visitorContext(browser)
  await open(context, run, doc(head), async (url) => (url.pathname === '/t.js' ? fetch(script.pass) : null))
  // /api/e is a POST: handled on its own route so the body goes through.
  const page = context.pages()[0]
  await page.route('http://example.com/api/e', async (r) => {
    const headers: Record<string, string> = { 'content-type': 'text/plain', 'user-agent': (await r.request().allHeaders())['user-agent'] }
    for (const [k, v] of events.headers) headers[k] = v
    const out = await fetch(events.pass, { method: 'POST', headers, body: r.request().postDataBuffer() })
    const h: Record<string, string> = {}
    out.headers.forEach((v, k) => (h[k] = v))
    return r.fulfill({ status: out.status, headers: h, body: '' })
  })
  await page.reload()
  await counted(request, `/m/${run}`)
  await context.close()
})

// Server-side: the emitted curl command, run by the shell, once.
test('Server-side (any language): the curl command counts', async ({ request, browserName }) => {
  test.skip(browserName !== 'chromium', 'no browser involved: once is enough')
  const m = METHODS.find((x) => x.id === 'server')!
  const host = `${runId('server', browserName)}.example.com`
  const code = m.code(ctxFor(host))
  expect(code).toContain("user-agent: <the visitor's browser user agent>")
  execFileSync('sh', ['-c', code.replace("<the visitor's browser user agent>", CHROME_UA)], { stdio: 'ignore', env: { ...process.env, http_proxy: PROXY } })
  await counted(request, '/pricing', host)
})

// Every method is run above, or named here with the reason it is not.
test('no method is left out', () => {
  const run = new Set([...HEAD_METHODS.map((m) => m.id), ...Object.keys(BUNDLED), 'next', 'node', 'proxy', 'server'])
  const notRun: Record<string, string> = {
    crawlers: 'robots are reported from the server; covered by the package test of reportCrawler and the Go test of /api/crawl',
  }
  for (const m of METHODS) expect(run.has(m.id) || m.id in notRun, `${m.id} is not proven by any test`).toBe(true)
})
