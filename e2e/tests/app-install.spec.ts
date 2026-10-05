// The dashboard as an installed app. Its worker keeps the page and the page's
// hashed files so the app starts without a network, and nothing else: an
// answer from the API, the tracking script or a shared page must never come
// from what the worker kept. The proof is two ways: the cache holds none of
// them, and with the network gone they fail instead of being answered.
import { expect, test, type Page } from './fixtures'
import { API } from '../playwright.config'

test.use({ serviceWorkers: 'allow' })

async function controlled(page: Page) {
  await page.goto(API + '/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload() // the first load is not controlled; the next is
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
}

/** Every address any cache holds. */
const kept = (page: Page) =>
  page.evaluate(async () => {
    const urls: string[] = []
    for (const name of await caches.keys()) for (const r of await (await caches.open(name)).keys()) urls.push(new URL(r.url).pathname)
    return urls
  })

test('the manifest and the worker are served for the whole dashboard', async ({ request }) => {
  const manifest = await request.get(`${API}/manifest.webmanifest`)
  expect(manifest.headers()['content-type']).toMatch(/^application\/manifest\+json/)
  const m = await manifest.json()
  expect(m).toMatchObject({ name: 'trckable', display: 'standalone', start_url: '/', scope: '/' })
  for (const icon of m.icons) expect((await request.get(API + icon.src)).status()).toBe(200)

  const sw = await request.get(`${API}/sw.js`)
  expect(sw.headers()['content-type']).toMatch(/^text\/javascript/)
  expect(sw.headers()['service-worker-allowed']).toBe('/')
  expect(sw.headers()['cache-control']).toBe('no-cache')
})

test('the worker keeps the app shell and never the API, the script or a shared page', async ({ page }) => {
  await controlled(page)
  // Things the page itself asks for while it runs, and ones asked for straight away.
  await page.evaluate(async () => {
    await fetch('/api/v1/setup')
    await fetch('/js/t.js')
    await fetch('/s/none').catch(() => undefined)
  })
  const urls = await kept(page)
  expect(urls).toContain('/')
  expect(urls.some((u) => u.startsWith('/assets/'))).toBe(true)
  expect(urls.filter((u) => /^\/(api|js|s)(\/|$)/.test(u))).toEqual([])
})

test('offline, the page still opens and the API is not answered from a copy', async ({ page, context, browserName }) => {
  test.skip(browserName === 'webkit', "Playwright's offline switch errors on a page WebKit's worker answers")
  await controlled(page)
  await context.setOffline(true)
  try {
    const res = await page.goto(API + '/')
    expect(res?.status()).toBe(200) // answered by the worker's kept page
    await expect(page.locator('#root')).not.toBeEmpty()
    // The API is not in the cache, so with no network it fails; a kept answer would succeed.
    const api = await page.evaluate(() => fetch('/api/v1/setup').then((r) => r.status, () => 'failed'))
    expect(api).toBe('failed')
    const script = await page.evaluate(() => fetch('/js/t.js').then((r) => r.status, () => 'failed'))
    expect(script).toBe('failed')
  } finally {
    await context.setOffline(false)
  }
})
