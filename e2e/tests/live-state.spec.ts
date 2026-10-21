// A site's state follows its last visit without a reload: the Quiet badge, the
// switcher's dot and line and the All sites page all read the one sites list
// the dashboard keeps current. The server's list is faked through the sites
// route, and the "visit" is the last-seen time moving.
import { expect, test, type Page } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

const NOW = Math.floor(Date.now() / 1000)
const WAIT = { timeout: 40_000 }

/** The sites list as the server would send it, with the history site last seen when the test says. */
async function fakeLastSeen(page: Page) {
  const seen = { at: NOW - 14 * 3600 }
  await page.route('**/api/v1/sites', async (r) => {
    if (r.request().method() !== 'GET') return r.continue()
    const res = await r.fetch()
    const body = (await res.json()) as { sites: Record<string, unknown>[] }
    for (const s of body.sites) if (s.domain === HISTORY_DOMAIN) Object.assign(s, { last_event_at: seen.at, down_since: undefined, check: undefined }) // the suite's server cannot reach the site: only the visit is under test
    await r.fulfill({ response: res, json: body })
  })
  return seen
}

test('a visit clears the Quiet badge and turns the switcher dot to now, with no reload', async ({ page }) => {
  test.slow()
  await page.context().addCookies([{ name: 'trckable_session', value: await session('live-state'), url: API }])
  const seen = await fakeLastSeen(page)
  await page.goto(`${API}/${HISTORY_DOMAIN}?period=7d`)
  const badge = page.locator('.footer-status[data-status="quiet"]') // the foot says it, nothing floats
  await expect(badge).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('#siteBtn .mk-dot.idle')).toBeVisible() // the button's dot is grey while it is quiet
  await expect(page.locator('#siteBtn')).toHaveAttribute('aria-label', /quiet/i)
  await page.locator('#siteBtn').click() // the switcher stays open while the visit arrives
  await expect(page.locator('#siteMenu .state-word.quiet')).toContainText('quiet 14h')
  await page.evaluate(() => ((window as unknown as { __kept?: boolean }).__kept = true))
  seen.at = Math.floor(Date.now() / 1000) - 5
  await expect(badge).toHaveCount(0, WAIT)
  await expect(page.locator('#siteMenu .site .mk-dot.now').first()).toBeVisible(WAIT)
  await expect(page.locator('#siteBtn .mk-dot.idle')).toHaveCount(0)
  await expect(page.locator('#siteBtn .mk-dot.now')).toBeVisible(WAIT)
  await expect(page.locator('#siteBtn')).not.toHaveAttribute('aria-label', /quiet/i)
  await expect(page.locator('#siteMenu .state-word')).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as { __kept?: boolean }).__kept)).toBe(true) // the same page: nothing reloaded
})

test('All sites follows the same last visit on the page that is open', async ({ page }) => {
  test.slow()
  await page.context().addCookies([{ name: 'trckable_session', value: await session('live-state-all'), url: API }])
  const seen = await fakeLastSeen(page)
  await page.goto(`${API}/sites`)
  const main = page.locator('.tm-page')
  await expect(main).toContainText(/quiet/i, { timeout: 20_000 })
  seen.at = Math.floor(Date.now() / 1000) - 5
  await expect(main).not.toContainText(/quiet/i, WAIT)
})
