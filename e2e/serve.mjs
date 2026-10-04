// Test site for the browser suite. Serves examples/html two ways:
//   /r/<run>/<page>   direct mode: script + events go straight to trckable
//   /p/<run>/<page>   proxy mode:  same-origin /js/t.js and /api/e, forwarded by
//                     the real trckable/server proxy with the site's proxy key
// And on PROXY_PORT, an HTTP proxy the browser is pointed at, so real domain
// names work in every engine: one site in two places (landing.spec.ts).
//   example.com       a plain HTML landing page, the script tag, data-domain
//   app.example.com   the Next.js setup: the npm package's init() (what
//                     <Analytics /> calls) and /api/e served by its proxy()
//   stats.example.com trckable itself
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { proxy } from '../packages/trckable/dist/server.js'

const PORT = Number(process.env.SITE_PORT || 18301)
const PROXY_PORT = Number(process.env.PROXY_PORT || 18302)
const TRCKABLE = process.env.TRCKABLE_URL || 'http://127.0.0.1:18300'
const BIN = process.env.TRCKABLE_BIN
const DATA = process.env.TRCKABLE_DATA_DIR

// The site is provisioned by trckabled at boot (TRCKABLE_SITES); wait for it.
async function siteInfo() {
  for (let i = 0; i < 100; i++) {
    try {
      const out = execFileSync(BIN, ['site', 'list'], { env: { ...process.env, TRCKABLE_DATA_DIR: DATA } }).toString()
      const line = out.split('\n').find((l) => l.includes('example.com'))
      if (line) {
        const [id, , key] = line.split('\t')
        return { id, key }
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('site not provisioned')
}

const site = await siteInfo()
// The dashboard holds an account without a working site in its first run, so
// the test site has had one visit before any test opens it.
await fetch(TRCKABLE + '/api/e', {
  method: 'POST',
  headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' },
  body: JSON.stringify({ s: site.id, k: 'pv', u: 'https://example.com/seed' }),
}).catch(() => undefined)
const forward = proxy({ host: TRCKABLE, proxyKey: site.key })

const scripts = {
  r: `<script defer src="${TRCKABLE}/js/t.js" data-site="${site.id}" data-dev></script>`,
  p: `<script defer src="/js/t.js" data-site="${site.id}" data-api="/api/e" data-dev></script>`,
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  try {
    if (url.pathname === '/_site') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ site: site.id, key: site.key }))
      return
    }
    if (url.pathname === '/api/e' && req.method === 'POST') {
      const chunks = []
      for await (const c of req) chunks.push(c)
      const headers = new Headers()
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
      headers.set('x-real-ip', req.socket.remoteAddress.replace('::ffff:', ''))
      const out = await forward(new Request(url, { method: 'POST', headers, body: Buffer.concat(chunks) }))
      const h = {}
      out.headers.forEach((v, k) => (h[k] = v))
      res.writeHead(out.status, h).end()
      return
    }
    if (url.pathname === '/js/t.js') {
      const r = await fetch(TRCKABLE + '/js/t.js')
      res.writeHead(r.status, { 'content-type': 'application/javascript' }).end(Buffer.from(await r.arrayBuffer()))
      return
    }
    // A page carrying another site's snippet, as the install guide writes it:
    // the install flow's test adds a site and opens this to make its first visit.
    const own = url.pathname.match(/^\/install\/(tkb_[a-z0-9]+)$/)
    if (own) {
      const tag = `<script\n  defer\n  data-site="${own[1]}"\n  data-dev\n  src="${TRCKABLE}/js/${own[1]}.js">\n</script>`
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><html><head><title>Installed</title>${tag}</head><body><h1>Installed</h1></body></html>`)
      return
    }
    // A customer page with one widget frame, as Settings → Widgets writes it
    // (widget-responsive.spec.ts): ?id, w, h, fit (the frame's style) and loader=0 for old code.
    if (url.pathname === '/widget-embed') {
      const q = url.searchParams
      const esc = (v) => String(v).replace(/[^\w ;:.%/-]/g, '')
      const frame = `<iframe src="${TRCKABLE}/w/${esc(q.get('id'))}" width="${esc(q.get('w'))}" height="${esc(q.get('h'))}" style="border:0;background:transparent;${esc(q.get('fit'))}" title="widget"></iframe>`
      const loader = q.get('loader') === '0' ? '' : `<script async src="${TRCKABLE}/js/w.js"></script>`
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Customer</title></head><body style="margin:0;padding:8px;background:#fff">${frame}${loader}</body></html>`)
      return
    }
    // A page carrying an online widget's corner script, as Settings → Widgets writes it.
    const corner = url.pathname.match(/^\/online\/(w_[a-z0-9]+)$/)
    if (corner) {
      const tag = `<script async src="${TRCKABLE}/js/${corner[1]}.online.js"></script>`
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><html><head><title>Customer</title></head><body><h1>Hello</h1>${tag}</body></html>`)
      return
    }
    // A page carrying the plain frame of a widget, as Settings → Widgets writes it.
    const framed = url.pathname.match(/^\/frame\/(w_[a-z0-9]+)$/)
    if (framed) {
      const tag = `<iframe src="${TRCKABLE}/w/${framed[1]}" width="280" height="248" title="Widget" style="border:0"></iframe>`
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><html><head><title>Customer</title></head><body><h1>Hello</h1>${tag}</body></html>`)
      return
    }
    // A sign-up form carrying a site's own script, with the heatmaps module in it
    // when the site has it on (heatmaps.spec.ts: what is typed is never sent).
    const heat = url.pathname.match(/^\/heat\/(tkb_[a-z0-9]+)\/[\w-]+$/)
    if (heat) {
      const form = ['email', 'full_name', 'company', 'secret', 'card'].map((n) => `<input name="${n}" type="${n === 'secret' ? 'password' : 'text'}" autocomplete="off">`).join('\n      ')
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><html><head><title>Sign up</title>
  <script defer src="${TRCKABLE}/js/${heat[1]}.js" data-dev></script></head><body><main id="page">
    <button class="join" type="button">Join</button>
    <div class="card" style="cursor:pointer">A card that does nothing</div>
    <form id="signup" action="/heat/${heat[1]}/thanks">
      ${form}
      <button type="submit">Go</button>
    </form>
  </main></body></html>`)
      return
    }
    const m = url.pathname.match(/^\/([rp])\/[\w-]+\/(.*)$/)
    if (m) {
      const [, mode, rest] = m
      if (rest.startsWith('files/')) {
        res.writeHead(200, { 'content-type': 'application/pdf', 'content-disposition': 'attachment' }).end('%PDF-1.4\n')
        return
      }
      // SPA routes (docs, blog) fall back to index.html, like any SPA host.
      const file = /\.html$/.test(rest) ? rest : 'index.html'
      const html = (await readFile(new URL(`../examples/html/${file}`, import.meta.url), 'utf8')).replace('{{SCRIPT}}', scripts[mode])
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html)
      return
    }
    res.writeHead(404).end()
  } catch (e) {
    res.writeHead(500).end(String(e))
  }
}).listen(PORT, '127.0.0.1', () => console.log(`test site on http://127.0.0.1:${PORT} (site ${site.id})`))

// ---- one site in two places, behind a forward proxy ----

const STATS = 'http://stats.example.com'
const PKG = new URL('../packages/trckable/dist/index.js', import.meta.url)

const landing = (path) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Landing</title>
<script defer src="${STATS}/js/t.js" data-site="${site.id}" data-domain="example.com" data-dev></script></head>
<body><h1>Landing ${path}</h1><a id="to-app" href="http://app.example.com${path.replace('/landing', '/app')}">Open the app</a></body></html>`

const app = (path) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>App</title>
<script type="module">import { init } from '/_next/trckable.js'; init({ site: '${site.id}', dev: true })</script></head>
<body><h1>App ${path}</h1><a id="buy" href="https://buy.stripe.com/test_e2e">Buy</a></body></html>`

async function body(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks)
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  try {
    if (url.hostname === 'stats.example.com') {
      const headers = { ...req.headers }
      delete headers.host
      const r = await fetch(TRCKABLE + url.pathname + url.search, {
        method: req.method,
        headers,
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await body(req),
      })
      const h = {}
      r.headers.forEach((v, k) => k !== 'content-encoding' && k !== 'content-length' && (h[k] = v))
      res.writeHead(r.status, h).end(Buffer.from(await r.arrayBuffer()))
      return
    }
    if (url.hostname === 'app.example.com') {
      if (url.pathname === '/api/e' && req.method === 'POST') {
        const headers = new Headers()
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
        headers.set('x-real-ip', '127.0.0.1')
        const out = await forward(new Request(url, { method: 'POST', headers, body: await body(req) }))
        const h = {}
        out.headers.forEach((v, k) => (h[k] = v))
        res.writeHead(out.status, h).end()
        return
      }
      if (url.pathname === '/_next/trckable.js') {
        res.writeHead(200, { 'content-type': 'application/javascript' }).end(await readFile(PKG))
        return
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(app(url.pathname))
      return
    }
    if (url.hostname === 'example.com') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(landing(url.pathname))
      return
    }
    res.writeHead(404).end()
  } catch (e) {
    res.writeHead(500).end(String(e))
  }
}).listen(PROXY_PORT, '127.0.0.1')
