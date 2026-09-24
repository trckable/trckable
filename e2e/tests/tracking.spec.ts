import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { API, TOKEN } from '../playwright.config'

type Ev = {
  seq: number
  kind: 'pageview' | 'goal' | 'engagement'
  path: string
  visitor: string
  session: string
  goal?: string
  props?: Record<string, string>
  channel?: string
  engaged_ms?: number
  browser?: string
}

let site = ''
test.beforeAll(async ({ request }) => {
  site = (await (await request.get('/_site')).json()).site
})

// A unique path prefix per test and browser keeps runs independent.
// Parallel repeats can start in the same millisecond: add randomness so they
// never share a prefix (and never read each other's events).
const runId = (page: Page, name: string) =>
  `${name}-${page.context().browser()!.browserType().name()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

async function events(request: APIRequestContext, prefix: string): Promise<Ev[]> {
  const r = await request.get(`${API}/api/v1/sites/${site}/events?limit=1000&path_prefix=${encodeURIComponent(prefix)}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  expect(r.ok()).toBeTruthy()
  return ((await r.json()).events as Ev[]).sort((a, b) => a.seq - b.seq)
}

const count = (evs: Ev[], kind: Ev['kind'], goal?: string) =>
  evs.filter((e) => e.kind === kind && (!goal || e.goal === goal)).length

/** Waits until `ready` holds, then waits a bit more to prove nothing extra arrives. */
async function settled(request: APIRequestContext, prefix: string, ready: (e: Ev[]) => boolean): Promise<Ev[]> {
  await expect.poll(async () => ready(await events(request, prefix)), { timeout: 15_000 }).toBe(true)
  await new Promise((r) => setTimeout(r, 1500)) // writer flushes every ≤1 s
  return events(request, prefix)
}

test('a full visit is counted exactly: pages, SPA routes, goals, scroll, download, outbound', async ({ page, request }) => {
  const run = runId(page, 'visit')
  const prefix = `/r/${run}/`
  await page.route('https://github.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>gh</h1>' }))

  await page.goto(`${prefix}index.html?utm_source=e2e`)
  await page.click('#signup')
  await page.locator('#pricing').scrollIntoViewIfNeeded()
  await page.click('#spa-docs')
  await page.click('#spa-same') // replaceState to the same URL: not a view
  await page.click('#spa-blog')
  const dl = page.waitForEvent('download')
  await page.click('#download')
  await dl
  await page.click('#outbound')
  await page.waitForURL('https://github.com/**')
  // Back on the site: anything the browser dropped while leaving is retried now.
  await page.goto(`${prefix}next.html`)

  const evs = await settled(request, prefix, (e) => count(e, 'pageview') >= 4 && count(e, 'goal') >= 4)

  expect(evs.filter((e) => e.kind === 'pageview').map((e) => e.path.slice(prefix.length - 1))).toEqual([
    '/index.html',
    '/docs',
    '/blog',
    '/next.html',
  ])
  expect(count(evs, 'goal', 'signup')).toBe(1)
  expect(evs.find((e) => e.goal === 'signup')!.props).toEqual({ plan: 'pro', trial_days: '14' })
  expect(count(evs, 'goal', 'saw_pricing')).toBe(1)
  expect(count(evs, 'goal', 'file_download')).toBe(1)
  expect(count(evs, 'goal', 'outbound_click')).toBe(1)
  expect(evs.find((e) => e.goal === 'outbound_click')!.props).toEqual({ url: 'github.com/trckable/trckable' })
  expect(count(evs, 'goal')).toBe(4)
  expect(count(evs, 'engagement')).toBeGreaterThanOrEqual(1)

  // One visitor, one session, attributed to the campaign it arrived from.
  expect(new Set(evs.map((e) => e.visitor)).size).toBe(1)
  expect(new Set(evs.map((e) => e.session)).size).toBe(1)
  expect(evs[0].channel).toBe('Referral') // utm_source=e2e, no referrer
})

test('an event the server stored but the browser never heard back about is counted once', async ({ page, request }) => {
  const run = runId(page, 'lostack')
  const prefix = `/r/${run}/`
  await page.goto(`${prefix}next.html`)
  await settled(request, prefix, (e) => count(e, 'pageview') === 1)

  // The goal reaches trckable, but the response is lost (network reset).
  await page.route('**/api/e', async (route) => {
    if (route.request().postDataJSON().k === 'g') {
      await route.fetch()
      await route.abort('connectionreset')
    } else await route.continue()
  })
  await page.click('#signup')
  await page.waitForTimeout(500)
  await page.unroute('**/api/e')

  // The next page retries it from the queue; the server must drop the duplicate.
  await page.goto(`${prefix}index.html`)
  const evs = await settled(request, prefix, (e) => count(e, 'pageview') === 2)
  expect(count(evs, 'goal', 'signup')).toBe(1)
})

test('events made offline are delivered once the visitor is back', async ({ page, context, request }) => {
  const run = runId(page, 'offline')
  const prefix = `/r/${run}/`
  await page.goto(`${prefix}next.html`)
  await settled(request, prefix, (e) => count(e, 'pageview') === 1)

  await context.setOffline(true)
  await page.click('#signup')
  await page.waitForTimeout(300)
  await context.setOffline(false)
  await page.goto(`${prefix}index.html`)

  const evs = await settled(request, prefix, (e) => count(e, 'goal', 'signup') === 1 && count(e, 'pageview') === 2)
  expect(count(evs, 'goal', 'signup')).toBe(1)
  expect(count(evs, 'pageview')).toBe(2)
})

test('same-origin proxy: the server sets a long-lived cookie and visitors stay one person', async ({ page, context, request }) => {
  const run = runId(page, 'proxy')
  const prefix = `/p/${run}/`
  await page.goto(`${prefix}index.html`)
  await expect.poll(async () => (await context.cookies()).find((c) => c.name === 'trckable_vid')).toBeTruthy()

  const cookie = (await context.cookies()).find((c) => c.name === 'trckable_vid')!
  const days = (cookie.expires * 1000 - Date.now()) / 86_400_000
  expect(days).toBeGreaterThan(399) // server-set: not subject to Safari's 7-day script cap
  expect(cookie.httpOnly).toBe(false) // readable, for checkout metadata

  await page.goto(`${prefix}next.html`)
  const evs = await settled(request, prefix, (e) => count(e, 'pageview') === 2)
  expect(count(evs, 'pageview')).toBe(2)
  expect(new Set(evs.map((e) => e.visitor))).toEqual(new Set([cookie.value.split('.')[0]]))
})

test('cookieless mode leaves nothing in the browser', async ({ page, context, request }) => {
  const run = runId(page, 'cookieless')
  const prefix = `/r/${run}/`
  await page.addInitScript(() => {
    // Turn the page's script tag into cookieless mode before it runs.
    new MutationObserver((_, obs) => {
      const s = document.querySelector('script[data-site]')
      if (s) {
        s.setAttribute('data-cookieless', '')
        obs.disconnect()
      }
    }).observe(document, { childList: true, subtree: true })
  })
  await page.goto(`${prefix}next.html`)
  await page.click('#signup')
  const evs = await settled(request, prefix, (e) => count(e, 'pageview') === 1 && count(e, 'goal') === 1)
  expect(evs).toHaveLength(2)
  expect((await context.cookies()).filter((c) => c.name.startsWith('trckable'))).toEqual([])
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('trckable')))).toEqual([])
})

test('checkout links carry the visitor id, so the sale can be attributed', async ({ page, request }) => {
  const run = runId(page, 'checkout')
  const prefix = `/r/${run}/`
  let landed = ''
  await page.route('https://buy.stripe.com/**', (r) => {
    landed = r.request().url()
    return r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>checkout</h1>' })
  })
  await page.goto(`${prefix}index.html`)
  const evs = await settled(request, prefix, (e) => count(e, 'pageview') >= 1)
  await page.evaluate(() => {
    const a = document.createElement('a')
    a.href = 'https://buy.stripe.com/test_eVa3cd'
    a.id = 'buy'
    a.textContent = 'Buy'
    document.body.append(a)
  })
  await page.click('#buy')
  await page.waitForURL('https://buy.stripe.com/**')
  const ref = new URL(landed).searchParams.get('client_reference_id')!
  // trckable_<visitor>_<first-seen>: the same visitor the server recorded.
  expect(ref).toMatch(/^trckable_[0-9a-z]+_[0-9a-z]+$/)
  expect(ref.split('_')[1]).toBe(evs[0].visitor)
})
