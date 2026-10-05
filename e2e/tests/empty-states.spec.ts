// Where a person has to start something, an empty list says so kindly: the ghost,
// one short line and one action. Goals, funnels, revenue, notes and alerts.
import { expect, test, type Page } from './fixtures'
import { mkdirSync } from 'node:fs'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

// Set EMPTY_SHOTS to a folder to also take the pictures for review.
const SHOTS = process.env.EMPTY_SHOTS

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('empty-states'), url: API }])
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

const states = (page: Page) => page.locator('.empty-state')

async function shot(page: Page, name: string, el = page.locator('.empty-state').first()) {
  if (!SHOTS) return
  mkdirSync(SHOTS, { recursive: true })
  for (const scheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await el.screenshot({ path: `${SHOTS}/${name}-${scheme}.png` })
  }
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
}

test('goals: a line and the button that starts one', async ({ page }) => {
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=data`)
  const card = page.locator('[data-card=what]')
  const empty = card.locator('.empty-state')
  await expect(empty).toBeVisible({ timeout: 15_000 })
  await expect(empty.locator('svg.tkb-ghost')).toHaveCount(1)
  await expect(empty.locator('p')).toHaveText(/goal/i)
  await expect(empty.getByRole('button')).toHaveCount(1)
  await shot(page, 'empty-goals', empty)
  await empty.getByRole('button', { name: 'Track a goal' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('notes: the list says what a note is for and offers one', async ({ page }) => {
  // Other suites leave notes on this site: the list is read as empty.
  await page.route(/\/api\/v1\/sites\/[^/]+\/annotations\?/, async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    const res = await route.fetch()
    await route.fulfill({ response: res, json: { ...(await res.json()), annotations: [] } })
  })
  await page.goto(`${API}/${HISTORY_DOMAIN}?mode=full`)
  await page.locator('.note-bar').getByRole('button', { name: /^Notes/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Notes' })
  await expect(dialog.locator('.empty-state')).toBeVisible()
  await expect(dialog.locator('.empty-state p')).toHaveText(/note/i)
  await shot(page, 'empty-notes', dialog.locator('.empty-state'))
  await dialog.getByRole('button', { name: 'Add a note' }).click()
  await expect(page.getByRole('dialog', { name: /note/i })).toBeVisible()
})

test('alerts: where to send them, before anything else', async ({ page }) => {
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=data`)
  await expect(page.locator('.overview-chart .chart-wrap svg[role="img"]')).toBeVisible({ timeout: 15_000 })
  await page.keyboard.press(',')
  const settings = page.getByRole('dialog', { name: /^Settings for/ })
  await settings.getByRole('tab', { name: /Alerts/ }).click()
  const empty = settings.locator('.empty-state')
  await expect(empty).toBeVisible()
  await expect(empty.locator('p')).toHaveText(/Alerts tell you/)
  await shot(page, 'empty-alerts', empty)
  await empty.getByRole('button', { name: /Add where to send/ }).click()
  await expect(settings.getByLabel('Where to send alerts')).toBeFocused()
})

test('funnels: two steps make one, and the card says so', async ({ page }) => {
  // A site whose report has no pages and no goals has nothing to suggest.
  await page.route(/\/api\/v1\/sites\/[^/]+\/report\?/, async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    for (const r of [body.current, body.previous]) if (r) (r.dims.entry_page = []), (r.goals = [])
    await route.fulfill({ response: res, json: body })
  })
  await page.goto(`${API}/${HISTORY_DOMAIN}?mode=full`)
  await page.locator('[data-card=what]').getByRole('tab', { name: 'Funnel' }).click()
  const empty = page.locator('.fn-panel .empty-state')
  await expect(empty).toBeVisible({ timeout: 15_000 })
  await expect(empty.getByRole('button')).toHaveCount(1)
  await shot(page, 'empty-funnel', empty)
})

test('revenue: payments connected, nothing credited to a source yet', async ({ page }) => {
  const MONEY = { currency: 'USD', exponent: 2, revenue: 0, refunds: 0, payments: 0, customers: 0, paying_visitors: 0, conversion: 0, revenue_per_visitor: 0, new_revenue: 0, renewal_revenue: 0, unattributed: 0, unconverted: 0 }
  await page.route(/\/api\/v1\/sites\/[^/]+\/modules$/, async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    for (const m of body.modules) if (m.id === 'revenue') m.enabled = true
    await route.fulfill({ response: res, json: body })
  })
  await page.route(/\/api\/v1\/sites\/[^/]+\/report\?/, async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    for (const r of [body.current, body.previous]) if (r) (r.money = MONEY), (r.revenue_dims = {})
    await route.fulfill({ response: res, json: body })
  })
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=data`)
  await page.locator('[data-card=what]').getByRole('tab', { name: 'Sources that pay' }).click()
  const empty = page.locator('[data-card=what] .empty-state')
  await expect(empty).toBeVisible({ timeout: 15_000 })
  await expect(empty.locator('p')).toHaveText(/credited to a source/)
  await shot(page, 'empty-revenue', empty)
  await empty.getByRole('button', { name: 'Payments settings' }).click()
  await expect(page.getByRole('dialog', { name: /^Settings for/ })).toBeVisible()
})
