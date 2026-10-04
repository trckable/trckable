// A stand-in for a trckable server, only as much as the WordPress plugin talks
// to: the site's script, /api/e and the report. It records what arrived, so a
// test can say exactly what the plugin forwarded.
import { createServer } from 'node:http'

const PORT = Number(process.env.MOCK_PORT || 19400)
const SITE = 'tkb_test00000001'
const API_KEY = 'tkb_live_testkey0001'
const seen = []

// What the real script does, in a line: send one pageview where data-api says.
const script = `(function(){var s=document.currentScript,d=s.dataset;window.__trckable=d;
fetch(d.api||new URL('/api/e',s.src).href,{method:'POST',headers:{'content-type':'text/plain'},body:JSON.stringify({s:d.site,k:'pv',u:location.href,r:''})});})();`

createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    if (url.pathname === '/__seen') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(seen))
      if (url.searchParams.has('clear')) seen.length = 0
      return
    }
    if (req.method === 'GET' && url.pathname === '/js/t.js') {
      return void res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8' }).end(script)
    }
    if (req.method === 'GET' && /^\/js\/tkb_\w+\.js$/.test(url.pathname)) { // any site id, as the real server does
      seen.push({ path: url.pathname })
      return void res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'public, max-age=3600' }).end(script)
    }
    if (req.method === 'POST' && url.pathname === '/api/e') {
      // As the real server answers: an unknown site, then an event without a page.
      let event = {}
      try { event = JSON.parse(body) } catch { /* not JSON */ }
      if (event.s !== SITE) return void res.writeHead(400).end('unknown site')
      if (!event.u) return void res.writeHead(400).end('bad payload')
      seen.push({ path: url.pathname, key: req.headers['x-trckable-proxy-key'], ip: req.headers['x-trckable-client-ip'], ua: req.headers['user-agent'], dnt: req.headers.dnt, body })
      return void res.writeHead(202, { 'set-cookie': ['trckable_vid=abc123; Max-Age=60; Path=/', 'other=1; Path=/'] }).end()
    }
    if (req.method === 'GET' && url.pathname === `/api/v1/sites/${SITE}/report`) {
      seen.push({ path: url.pathname, query: url.search, auth: req.headers.authorization })
      if (req.headers.authorization !== `Bearer ${API_KEY}`) return void res.writeHead(401).end('{}')
      return void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ current: { kpis: { visitors: 1234 }, series: [150, 180, 160, 210, 190, 230, 114].map((visitors) => ({ visitors })), dims: { page: [{ value: '/', visitors: 600 }, { value: '/pricing', visitors: 300 }] } }, online: 7 }))
    }
    res.writeHead(404).end('not found')
  })
}).listen(PORT, '127.0.0.1')
