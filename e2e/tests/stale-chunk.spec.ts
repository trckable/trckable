// A tab opened before a deploy still runs the old build, and the chunks that
// build asks for are gone. The server says so with a 404 (never the page, which
// would load as a script and fail on its type); the dashboard reloads once, on
// the same address, and never twice in a minute; a page that still cannot load
// says so in a line and offers the reload, instead of going black.
import { expect, test, type Page } from '@playwright/test'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

const FLAG = 'trckable:reloaded'
const ADDRESS = `${API}/${HISTORY_DOMAIN}?period=7d&metric=pageviews&view=data`

let cookie = ''
test.beforeAll(async () => {
  cookie = await session('stale-chunk')
})

/** The date picker's list is a chunk of its own, asked for when it opens: the one a tab older than the deploy asks for in vain. */
async function goneAfterDeploy(page: Page) {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.route(/\/assets\/DateRangePopover-[0-9a-f]+\.js$/, (route) => route.continue({ url: `${API}/assets/DateRangePopover-00000000.js` }))
}

/** The server has been updated: what the page asks it for now (the probe the reload waits on) names another build. */
async function deployed(page: Page) {
  await page.route(`${API}/`, async (route) => {
    if (route.request().resourceType() !== 'fetch') return route.fallback()
    const res = await route.fetch()
    await route.fulfill({ response: res, body: (await res.text()).replace(/assets\/index-[0-9a-f]+\.js/g, 'assets/index-00000000.js') })
  })
}

function watch(page: Page) {
  const seen = { loads: 0, errors: [] as string[] }
  // The page's own loads, counted by their requests: a fresh page's blank first load is not one of them.
  page.on('request', (r) => r.resourceType() === 'document' && r.url().startsWith(API) && seen.loads++)
  page.on('pageerror', (e) => seen.errors.push(e.message))
  return seen
}

test('a missing asset is a 404 a loader can read, never the page', async ({ request }) => {
  const res = await request.get(`${API}/assets/AccountItems-137721bf.js`)
  expect(res.status()).toBe(404)
  expect(res.headers()['content-type']).toMatch(/^text\/plain/)
  expect(res.headers()['cache-control']).toBe('no-store')
  expect(await res.text()).not.toContain('<html')
  // The page itself: never kept, and a site's address (it has a dot in it) is still the page.
  const page = await request.get(`${API}/${HISTORY_DOMAIN}`)
  expect(page.status()).toBe(200)
  expect(page.headers()['content-type']).toMatch(/^text\/html/)
  expect(page.headers()['cache-control']).toBe('no-cache')
})

test('a chunk the new build no longer has: the page reloads once, on the same address, and works', async ({ page }) => {
  const seen = watch(page)
  await goneAfterDeploy(page)
  await deployed(page)
  await page.goto(ADDRESS)
  await expect(page.locator('.chart-wrap svg[role=img]').first()).toBeVisible({ timeout: 30_000 })
  expect(seen.loads).toBe(1)
  await page.locator('button.range').click() // asks for the chunk that is gone
  await expect.poll(() => seen.loads, { message: 'the page reloads', timeout: 20_000 }).toBe(2)
  await expect(page.locator('.chart-wrap svg[role=img]').first(), 'the dashboard is back, not a black page').toBeVisible({ timeout: 30_000 })
  expect(page.url(), 'the period and the number are kept').toBe(ADDRESS)
  expect(await page.evaluate((k) => sessionStorage.getItem(k), FLAG)).not.toBeNull()
  await page.waitForTimeout(2000)
  expect(seen.loads, 'once, not a loop').toBe(2)
  expect(seen.errors).toEqual([])
})

test('a chunk that fails while the server runs this very build is no stale tab: no reload, only the line', async ({ page }) => {
  const seen = watch(page)
  await goneAfterDeploy(page) // the chunk is missing, but nothing was deployed
  await page.goto(ADDRESS)
  await expect(page.locator('.chart-wrap svg[role=img]').first()).toBeVisible({ timeout: 30_000 })
  await page.locator('button.range').click()
  await expect(page.getByText("Couldn't draw this.")).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(2000)
  expect(seen.loads, 'no reload').toBe(1)
  expect(await page.evaluate((k) => sessionStorage.getItem(k), FLAG)).toBeNull()
})

test('after that reload, a chunk that is still missing says so in a line, and does not reload again', async ({ page }) => {
  const seen = watch(page)
  await goneAfterDeploy(page)
  await deployed(page)
  await page.addInitScript((k) => sessionStorage.setItem(k, String(Date.now())), FLAG) // this page was reloaded just now
  await page.goto(ADDRESS)
  await expect(page.locator('.chart-wrap svg[role=img]').first()).toBeVisible({ timeout: 30_000 })
  await page.locator('button.range').click()
  await expect(page.getByText("Couldn't draw this."), 'an inline message, not a black page').toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible()
  await page.waitForTimeout(2000)
  expect(seen.loads, 'no second reload').toBe(1)
  expect(seen.errors).toEqual([])
})
