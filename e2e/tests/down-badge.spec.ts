// A site the server's uptime probe finds not answering shows the same Down
// badge as a stopped one, even while visitors still get through, and its
// panel says why. The probe's state is faked through the sites route.
import { expect, test } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

const SHOTS = process.env.POLISH_SHOTS
const NOW = Math.floor(Date.now() / 1000)

test('a site the probe finds down is told in the foot, by its name and on the Live dot', async ({ page }) => {
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
  // Nothing floats: the foot's status is the one way in, and the site's name carries a red dot.
  const status = page.locator('.footer-status')
  await expect(status).toHaveAttribute('data-status', 'down', { timeout: 20_000 })
  await expect(page.locator('.status-float')).toHaveCount(0)
  await expect(page.locator('.view-switch.down')).toBeVisible()
  await expect(page.locator('.site-zone .state-dot.stopped')).toBeVisible()
  await status.click()
  await expect(page.locator('.status-pop')).toContainText('Some visitors still get through')
  await expect(page.locator('.status-pop')).toContainText('No answer within 10 seconds')
  await expect(page.getByRole('link', { name: 'See incident' })).toBeVisible()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/downfix-badge-1440.png` })
})

test('the Live card says Down in its header, and the panel in the foot lists the last checks, the time once', async ({ page }) => {
  test.slow()
  await page.context().addCookies([{ name: 'trckable_session', value: await session('down-live'), url: API }])
  await page.route('**/api/v1/sites', async (r) => {
    if (r.request().method() !== 'GET') return r.continue()
    const res = await r.fetch()
    const body = (await res.json()) as { sites: Record<string, unknown>[] }
    for (const s of body.sites) {
      if (s.domain === HISTORY_DOMAIN) Object.assign(s, { last_event_at: NOW - 30, down_since: NOW - 4 * 60, down_cause: 'No answer within 10 seconds' })
    }
    await r.fulfill({ response: res, json: body })
  })
  const looks = [0, 1, 2].map((i) => ({ at: NOW - (i + 1) * 120, error: i < 2 ? 'No answer within 10 seconds' : undefined, status: i < 2 ? 0 : 200, ms: 140 }))
  await page.route('**/api/v1/sites/*/probes', (r) => r.fulfill({ json: { probes: looks } }))
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=live`)
  await expect(page.locator('.view-switch.live')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.live-state.down')).toHaveText('Down') // the Live card's header says it
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/down2-live-badge-1440.png` })
  await page.locator('.footer-status').click()
  const pop = page.locator('.status-pop')
  await expect(pop.locator('[data-probe]')).toHaveCount(3)
  await expect(pop.getByText(/since/)).toHaveCount(1)
  await expect(pop.getByText('Checking…')).toHaveCount(0)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/down2-live-panel-1440.png` })
  if (SHOTS) {
    await page.goto(`${API}/${HISTORY_DOMAIN}/incidents`)
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${SHOTS}/down2-incidents-1440.png` })
  }
})
