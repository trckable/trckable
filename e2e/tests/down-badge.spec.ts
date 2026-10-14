// A site the server's uptime probe finds not answering shows the same Down
// badge as a stopped one, even while visitors still get through, and its
// panel says why. The probe's state is faked through the sites route.
import { expect, test } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

const SHOTS = process.env.POLISH_SHOTS
const NOW = Math.floor(Date.now() / 1000)

test('a site the probe finds down gets the Down badge and a red Live dot', async ({ page }) => {
  test.slow()
  await page.context().addCookies([{ name: 'trckable_session', value: await session('down-badge'), url: API }])
  await page.route('**/api/v1/sites', async (r) => {
    if (r.request().method() !== 'GET') return r.continue()
    const res = await r.fetch()
    const body = (await res.json()) as { sites: Record<string, unknown>[] }
    for (const s of body.sites) {
      if (s.domain === HISTORY_DOMAIN) Object.assign(s, { last_event_at: NOW - 30, down_since: NOW - 12 * 60, down_cause: 'No answer within 10 seconds' })
    }
    await r.fulfill({ response: res, json: body })
  })
  await page.goto(`${API}/${HISTORY_DOMAIN}?period=7d`)
  const badge = page.getByRole('button', { name: /^Down · 12m/ })
  await expect(badge).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.view-switch.down')).toBeVisible()
  await badge.click()
  await expect(page.locator('.status-pop')).toContainText('Some visitors still get through')
  await expect(page.locator('.status-pop')).toContainText('No answer within 10 seconds')
  await expect(page.getByRole('link', { name: 'See incident' })).toBeVisible()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/downfix-badge-1440.png` })
})
