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

test('an incident is marked on the chart and listed on its page', async ({ page }) => {
  test.slow()
  await page.context().addCookies([{ name: 'trckable_session', value: await session('incident-history'), url: API }])
  let id = ''
  await page.route('**/api/v1/sites', async (r) => {
    if (r.request().method() !== 'GET') return r.continue()
    const res = await r.fetch()
    const body = (await res.json()) as { sites: Record<string, unknown>[] }
    for (const s of body.sites) {
      if (s.domain !== HISTORY_DOMAIN) continue
      id = String(s.id)
      Object.assign(s, { last_event_at: NOW - 8 * H, check: { at: NOW - 60, error: 'timeout', down_since: NOW - 2 * H } })
    }
    await r.fulfill({ response: res, json: body })
  })
  const past = incident({ id: 'inc_old', started_at: NOW - 30 * H, ended_at: NOW - 30 * H + 3 * H + 12 * 60, expected_visits: 340, note: 'Hosting migration' })
  const open = incident({ id: 'inc_now', kind: 'quiet', started_at: NOW - 2 * H, cause: 'no visits' })
  await page.route('**/api/v1/sites/*/incidents?*', async (r) => {
    const url = new URL(r.request().url())
    const list = url.searchParams.has('from') ? [open, past] : [open, past]
    const rows = list.map((x) => ({ ...x, site: id }))
    const seconds = 3 * H + 12 * 60 + 2 * H
    await r.fulfill({ json: url.searchParams.has('from') ? { incidents: rows, summary: { count: 2, seconds, lost: 340, lost_some: true } } : { incidents: rows, next_before: null } })
  })

  // The chart: a mark under the axis where the first one began; its line on hover.
  await page.goto(`${API}/${HISTORY_DOMAIN}?period=7d`)
  const mark = page.locator('.inc-mark').first()
  await expect(mark).toBeVisible({ timeout: 20_000 })
  await pageSettled(page) // nothing moves under the pointer after this
  await mark.hover()
  await expect(page.locator('.inc-tip')).toContainText('Down 3h 12m · not reachable')
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/incidents-chart-1280.png` })

  // The status panel has one quiet link to the history.
  await page.getByRole('button', { name: /^(Down|Quiet) ·/ }).click()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/incidents-panel-1280.png` })
  await page.getByRole('link', { name: 'Incident history' }).click()
  await expect(page).toHaveURL(new RegExp(`/${HISTORY_DOMAIN}/incidents`))

  // The page: figures, the day strip and the list with the note and what we saw.
  await expect(page.getByRole('heading', { name: 'Uptime & incidents' })).toBeVisible()
  await expect(page.locator('.inc-card').nth(0)).toContainText('2')
  await expect(page.locator('.inc-card').nth(3)).toContainText('≈ 340 visits')
  await expect(page.locator('.inc-days i.down').first()).toBeVisible()
  const rows = page.locator('.inc-row')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(1)).toContainText('Down · 3h 12m')
  await expect(rows.nth(1)).toContainText('Hosting migration')
  await expect(rows.nth(1)).toContainText('timeout')
  await expect(rows.nth(0)).toContainText('Quiet')
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/incidents-page-1280-dark.png`, fullPage: true })
})

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
