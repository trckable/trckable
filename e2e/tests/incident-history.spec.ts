// A site that went down leaves a record, and the page for it answers first: how the site is now, the period's uptime, the
// figures (equal to the rows under them), the days we watched and the incidents with what the checks saw. The incident is
// faked through the API route; the server's own record is covered by its Go tests.
import { expect, test } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

const NOW = Math.floor(Date.now() / 1000)
const H = 3600
const SHOTS = process.env.POLISH_SHOTS

const incident = (o: Record<string, unknown>) => ({ id: 'inc_1', site: '', kind: 'down', started_at: 0, ended_at: null, cause: 'timeout', expected_visits: null, note: '', ...o })

async function open(page: import('@playwright/test').Page, incidents: unknown[]) {
  // A site watched for a month, whatever age the test site really has.
  await page.route(/\/api\/v1\/sites(\?.*)?$/, async (r) => {
    const res = await r.fetch()
    const body = await res.json()
    await r.fulfill({ response: res, json: { ...body, sites: body.sites.map((s: Record<string, unknown>) => ({ ...s, watched_since: NOW - 40 * 86400 })) } })
  })
  await page.context().addCookies([{ name: 'trckable_session', value: await session('incident-history'), url: API }])
  await page.route('**/api/v1/sites/*/incidents?*', async (r) => {
    const url = new URL(r.request().url())
    await r.fulfill({ json: url.searchParams.has('from') ? { incidents, summary: { count: incidents.length, seconds: 0, lost: 0, lost_some: false } } : { incidents, next_before: null } })
  })
  await page.goto(`${API}/${HISTORY_DOMAIN}/incidents?period=30d`)
  await expect(page.getByRole('heading', { name: 'Uptime & incidents' })).toBeVisible({ timeout: 20_000 })
}

test('with an incident: the state, the figures equal the rows, no back link', async ({ page }) => {
  const rows = [
    incident({ id: 'a', kind: 'down', started_at: NOW - 3 * H, ended_at: NOW - 2 * H, expected_visits: 12 }),
    incident({ id: 'b', kind: 'quiet', started_at: NOW - 30 * H, ended_at: NOW - 28 * H, cause: 'no visits, page answered', expected_visits: 30 }),
  ]
  await open(page, rows)
  await expect(page.getByText('Back to the dashboard')).toHaveCount(0)
  await expect(page.locator('.inc-state')).toHaveText('Up')
  // The figures are what the two rows add up to: 2 incidents, 3h down or quiet, 42 visits.
  const stat = (name: string) => page.locator('.inc-stats div').filter({ hasText: name }).locator('dd')
  await expect(page.locator('.inc-row')).toHaveCount(2)
  await expect(stat('Incidents')).toHaveText('2')
  await expect(stat('Down or quiet for')).toHaveText('3h')
  await expect(stat('Visits lost')).toHaveText('≈ 42')
  await expect(page.locator('.inc-line')).toHaveText('2 incidents, about 42 visits lost')
  // Newest first.
  await expect(page.locator('.inc-row').first()).toContainText('Down')
  await expect(page.locator('.inc-empty')).toHaveCount(0)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/incidents-with.png` })
})

test('a site that is down says so in red, and an empty period says so once', async ({ page }) => {
  await open(page, [incident({ id: 'c', kind: 'down', started_at: NOW - 9 * 60, ended_at: null })])
  await expect(page.locator('.inc-state.down')).toHaveText(/^Down for \d+m$/)
  await page.unroute('**/api/v1/sites/*/incidents?*')
  await open(page, [])
  await expect(page.locator('.inc-state.up')).toHaveText('Up')
  await expect(page.locator('.inc-empty')).toHaveText('No incidents in this period')
  await expect(page.locator('.inc-row')).toHaveCount(0)
  await expect(page.locator('.inc-stats div').filter({ hasText: 'Incidents' }).locator('dd')).toHaveText('0')
  await expect(page.locator('.inc-days i.unwatched')).toHaveCount(0)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/incidents-none.png` })
})

test('the period pill is the Briefing\'s, and its menu hangs from it', async ({ page }) => {
  await open(page, [])
  await page.locator('.inc-head .pill').click()
  await expect(page.locator('.inc-head .pmenu.on')).toBeVisible()
  await expect(page.locator('.inc-head .pmenu.on')).not.toContainText('Compare')
})
