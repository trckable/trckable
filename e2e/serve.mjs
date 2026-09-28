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
