// A site that went down leaves a record: the status panel links to it, the
// chart marks where it began (its line on hover, the page on click), and the
// page lists it with what the checks saw. The incident is faked through the
// API route; the server's own record is covered by its Go tests.
import { expect, test } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'
import { pageSettled } from './pageSettled'

const SHOTS = process.env.POLISH_SHOTS
const NOW = Math.floor(Date.now() / 1000)
const H = 3600

const incident = (o: Record<string, unknown>) => ({ id: 'inc_1', site: '', kind: 'down', started_at: 0, ended_at: null, cause: 'timeout', expected_visits: null, note: '', ...o })


test('a quiet period is one calm card, and the period menu hangs from its picker', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('incident-history'), url: API }])
  await page.route('**/api/v1/sites/*/incidents?*', async (r) => {
    const url = new URL(r.request().url())
    await r.fulfill({ json: url.searchParams.has('from') ? { incidents: [], summary: { count: 0, seconds: 0, lost: 0, lost_some: false } } : { incidents: [], next_before: null } })
  })
  await page.goto(`${API}/${HISTORY_DOMAIN}/incidents?period=30d`)
  await expect(page.getByRole('heading', { name: 'Uptime & incidents' })).toBeVisible({ timeout: 20_000 })

  // No row of four mostly empty cards, no "All incidents", the good news said once.
  await expect(page.locator('.inc-clear')).toHaveCount(1)
  await expect(page.locator('.inc-clear')).toContainText('No incidents')
  await expect(page.locator('.inc-card')).toHaveCount(0)
  await expect(page.getByText(/No incidents/)).toHaveCount(1)
  await expect(page.getByRole('heading', { name: 'All incidents' })).toHaveCount(0)
  // The site is new: the days before it was added are not "no incident".
  await expect(page.locator('.inc-days i.unwatched').first()).toBeVisible()
  await expect(page.locator('.inc-legend .unwatched')).toBeVisible()

  // The menu opens under the picker, not at the window's edge.
  await page.locator('.inc-head .btn.range').click()
  const pick = (await page.locator('.inc-head .range-picker').boundingBox())!
  const menu = (await page.locator('.inc-head .range-pop').boundingBox())!
  expect(Math.abs(menu.x + menu.width - (pick.x + pick.width))).toBeLessThan(40)
  expect(menu.y - (pick.y + pick.height)).toBeLessThan(40)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/incidents-zero-menu.png` })
})
