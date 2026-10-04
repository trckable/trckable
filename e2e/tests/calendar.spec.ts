// The calendar in Data: the switch between the chart and the month grid, a
// day's card and the way into the day, the keyboard, and a plan for a day to
// come (kept as a note, dashed in its cell).
import { expect, test, type Page } from '@playwright/test'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

const SHOTS = process.env.POLISH_SHOTS
const iso = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10)

let cookie = ''
test.beforeAll(async () => {
  cookie = await session('calendar')
})

async function open(page: Page, query: string) {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${HISTORY_DOMAIN}?${query}`)
}

test('the switch opens the month, and the address keeps it', async ({ page }) => {
  await open(page, 'view=data')
  await page.getByRole('button', { name: 'Calendar', exact: true }).click()
  await expect(page).toHaveURL(/cal=1/)
  await expect(page.getByRole('grid')).toBeVisible()
  await expect(page.locator(`[data-day="${iso(-1)}"]`)).toBeVisible()
  await page.reload()
  await expect(page.getByRole('grid')).toBeVisible()
  await page.getByRole('button', { name: 'Chart', exact: true }).click()
  await expect(page).not.toHaveURL(/cal=/)
  await expect(page.getByRole('grid')).toHaveCount(0)
})

test('a day opens its card, and Open this day filters Data to it', async ({ page }) => {
  const day = iso(-1)
  await open(page, `cal=${day.slice(0, 7)}`)
  const cell = page.locator(`[data-day="${day}"]`)
  await expect(cell.locator('.cal-v')).toHaveText('6')
  await cell.click()
  await expect(page).toHaveURL(new RegExp(`cal=${day}`))
  const card = page.getByRole('complementary')
  await expect(card.locator('.cal-strip')).toBeVisible()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/calendar-day.png` })
  await card.getByRole('button', { name: 'Open this day' }).click()
  await expect(page).toHaveURL(new RegExp(`from=${day}&to=${day}`))
  await expect(page).not.toHaveURL(/cal=/)
})

test('the arrows move between days and Enter opens one', async ({ page }) => {
  const day = iso(-2)
  await open(page, `cal=${day.slice(0, 7)}`)
  const cell = page.locator(`[data-day="${day}"]`)
  await expect(cell).toBeVisible()
  await cell.focus()
  await page.keyboard.press('ArrowRight')
  const next = new Date(Date.parse(day) + 86400_000).toISOString().slice(0, 10)
  if (next.slice(0, 7) === day.slice(0, 7)) {
    await expect(page.locator(`[data-day="${next}"]`)).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`cal=${next}`))
  }
})

test('a plan for a day to come shows dashed in its cell', async ({ page }) => {
  const day = iso(3)
  const text = `Newsletter ${Date.now()}`
  await open(page, `cal=${day.slice(0, 7)}`)
  const cell = page.locator(`[data-day="${day}"]`)
  await expect(cell).toHaveClass(/future/)
  await expect(cell.locator('.cal-soon')).toContainText('expected')
  await cell.click()
  const card = page.getByRole('complementary')
  await card.getByPlaceholder('What is planned').fill(text)
  await card.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator(`[data-day="${day}"] .cal-chip.plan`)).toHaveText(text)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/calendar-plan.png` })
})

test('screenshots of the month', async ({ page }) => {
  test.skip(!SHOTS, 'only with POLISH_SHOTS')
  for (const [name, w, h, scheme] of [
    ['1280-dark', 1280, 900, 'dark'],
    ['1280-light', 1280, 900, 'light'],
    ['390-dark', 390, 844, 'dark'],
  ] as const) {
    await page.setViewportSize({ width: w, height: h })
    await page.emulateMedia({ colorScheme: scheme })
    await open(page, `cal=${iso(-1).slice(0, 7)}-01`.replace(/-01$/, ''))
    await expect(page.getByRole('grid')).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/calendar-${name}.png`, fullPage: true })
    await page.locator(`[data-day="${iso(-1)}"]`).click()
    await expect(page.getByRole('complementary')).toBeVisible()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${SHOTS}/calendar-${name}-card.png` })
  }
})
