// "No comparison" says no change figures anywhere they appear: the key
// numbers, the lists' arrows, the "vs usual" chip and the CSV (no comparison
// row). Turn a comparison on and every one of them is back, in the same words.
import { expect, test, type Page } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('no-comparison'), url: API }])
})

const day = (back: number) => new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10)
// The history site has visitors 1 to 4 days ago: the last two days against the two before them both have some.
const path = (compare: string) => `/${HISTORY_DOMAIN}?view=data&period=custom&from=${day(1)}&to=${day(0)}${compare}`

async function loaded(page: Page) {
  await expect(page.locator('.kpi .value.num').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('[data-card=who] .bl-row').first()).toBeVisible()
}

test('no comparison: no change under the numbers, none beside the rows, none in the file', async ({ page }) => {
  await page.goto(API + path(''))
  await loaded(page)
  await expect(page.locator('.kpis .kpi-delta .num, .kpis .kpi-delta[title]')).toHaveCount(0)
  await expect(page.locator('[data-card=who] .bl-chg:not(:empty)')).toHaveCount(0)
  await expect(page.locator('.kpi-chip')).toHaveCount(0)

  // The file the page's own Export gives asks for no comparison.
  await page.getByRole('button', { name: 'More', exact: true }).click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /Export as CSV/ }).click()])
  expect(download.url()).toContain('/export.csv')
  expect(download.url()).not.toContain('compare=')
})

test('a comparison brings every change figure back, and the file carries it', async ({ page }) => {
  await page.goto(API + path('&compare=previous'))
  await loaded(page)
  await expect(page.locator('.kpis .kpi-delta[title]').first()).toBeVisible()
  await expect(page.locator('[data-card=who] .bl-chg:not(:empty)').first()).toBeVisible()
  await page.getByRole('button', { name: 'More', exact: true }).click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /Export as CSV/ }).click()])
  expect(download.url()).toContain('compare=')
})

test('the usual chip is only where the change is: today with a comparison, never without', async ({ page }) => {
  await page.route(/\/api\/v1\/sites\/[^/]+\/usual\?/, (route) => route.fulfill({ json: { visitors: 59, average: 50, weeks: [{ day: day(7), visitors: 50 }, { day: day(14), visitors: 50 }] } }))
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=data&period=today&compare=previous`)
  await expect(page.locator('.kpi .value.num').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.kpi-chip')).toHaveText('+18% vs usual', { timeout: 15_000 })
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=data&period=today`)
  await expect(page.locator('.kpi .value.num').first()).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(2500)
  await expect(page.locator('.kpi-chip')).toHaveCount(0)
})
