// Test site for the browser suite. Serves examples/html two ways:
//   /r/<run>/<page>   direct mode: script + events go straight to trckable
//   /p/<run>/<page>   proxy mode:  same-origin /js/t.js and /api/e, forwarded by
//                     the real trckable/server proxy with the site's proxy key
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { proxy } from '../packages/trckable/dist/server.js'

const PORT = Number(process.env.SITE_PORT || 18301)
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
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ site: site.id }))
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
