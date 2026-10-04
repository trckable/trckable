// The service worker: the app shell (the page and its hashed files) kept for a
// start without a network, and nothing else. The server fills in the version
// (the hash of the page), so every deploy is a new worker and a new cache.
//
// It answers only the page and its own files. Everything else, the API, the
// script, shared pages, anything signed in, is not handled here at all: it goes
// to the network as if there were no worker.
const V = '__V__'
const SHELL = ['/theme.js', '/favicon.svg']
const OWN = /^\/(api|js|s|webhooks|_trckable|healthz|readyz|metrics)(\/|$)/
const hold = { cacheName: V, ignoreVary: true }

self.addEventListener('install', (e) =>
  e.waitUntil(
    (async () => {
      const cache = await caches.open(V)
      const page = await fetch('/', { cache: 'reload' })
      if (!page.ok) throw new Error('page')
      const files = (await page.clone().text()).match(/\/assets\/[^"'\s)]+/g) || []
      await cache.put('/', page)
      await cache.addAll([...new Set([...SHELL, ...files])])
      await self.skipWaiting()
    })(),
  ),
)

self.addEventListener('activate', (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== V).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  ),
)

self.addEventListener('fetch', (e) => {
  const r = e.request
  const u = new URL(r.url)
  if (r.method !== 'GET' || u.origin !== location.origin || OWN.test(u.pathname)) return
  if (r.mode === 'navigate') {
    e.respondWith(fetch(r).catch(() => caches.match('/', hold)))
  } else if (u.pathname.startsWith('/assets/')) {
    // Hashed names never change what they hold: the copy kept is the answer.
    e.respondWith(caches.match(r, hold).then((hit) => hit || fetch(r)))
  } else if (SHELL.includes(u.pathname)) {
    e.respondWith(fetch(r).catch(() => caches.match(r, hold)))
  }
})
