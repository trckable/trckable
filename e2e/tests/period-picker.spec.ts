// The period is one control: the calendar, "Last 30 days", a small tag while a comparison is on, the
// chevron. The comparison's choices are in the same list; nothing else sits beside it.
// Pictures for the review: POLISH_SHOTS=<folder>.
import { expect, test } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

const SHOTS = process.env.POLISH_SHOTS

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('period-picker'), url: API }])
})

for (const width of [1440, 1280, 800]) {
  test(`one control holds the period and its comparison at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto(`${API}/${HISTORY_DOMAIN}?view=data&period=30d&compare=previous`)
    const period = page.locator('.ctl-cap .btn.range')
    await expect(period).toBeVisible({ timeout: 15_000 })
    await page.evaluate(() => document.fonts.ready)
    // The calendar, the words, the tag and the chevron are inside it; no second button for the comparison.
    await expect(period.locator('.range-icon')).toBeVisible()
    await expect(period.locator('.range-label')).toHaveText('Last 30 days')
    await expect(period.locator('.range-cmp')).toHaveText('± vs before')
    await expect(period.locator('.range-chev')).toBeVisible()
    await expect(page.locator('.cmp-btn, .cmp-root')).toHaveCount(0)
    // Screen readers still hear what it compares with.
    await expect(period).toContainText(/vs the 30 days before/)
    // One hairline pill: the same height as its neighbours, a round end.
    const look = await period.evaluate((el) => {
      const c = getComputedStyle(el)
      return { border: c.borderTopWidth, bg: c.backgroundColor, radius: parseFloat(c.borderTopLeftRadius), h: el.getBoundingClientRect().height }
    })
    expect(look.border).toBe('1px')
    expect(look.bg).toBe('rgba(0, 0, 0, 0)')
    expect(look.radius).toBeGreaterThan(16)
    expect(look.h).toBe(36)
    if (SHOTS && width === 1440) {
      for (const scheme of ['dark', 'light'] as const) {
        await page.emulateMedia({ colorScheme: scheme })
        await page.screenshot({ path: `${SHOTS}/polish-period-${width}-${scheme}.png`, clip: { x: width - 520, y: 60, width: 520, height: 80 } })
      }
    }
  })
}

test('no comparison: no tag; the list has the comparison choices outside More; C and the list agree', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 })
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=data&period=30d&compare=none`)
  const period = page.locator('.ctl-cap .btn.range')
  await expect(period).toBeVisible({ timeout: 15_000 })
  await expect(period.locator('.range-cmp')).toHaveCount(0)
  await period.click()
  const list = page.getByRole('dialog', { name: 'Choose a date range' })
  const compare = list.getByRole('group', { name: 'Compare' })
  // Visible at once, without opening More.
  await expect(compare).toBeVisible()
  await expect(compare.getByRole('button', { name: 'No comparison' })).toHaveAttribute('aria-pressed', 'true')
  await compare.getByRole('button', { name: 'Period before' }).click()
  await expect(list).toBeVisible()
  await expect(period.locator('.range-cmp')).toHaveText('± vs before')
  await compare.getByRole('button', { name: 'Last year' }).click()
  await expect(period.locator('.range-cmp')).toHaveText('± vs last year')
  await compare.getByRole('button', { name: 'No comparison' }).click()
  await expect(period.locator('.range-cmp')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(list).toBeHidden()
  await expect(period).toBeFocused()
  // The C key does the same without the list.
  await page.locator('body').click({ position: { x: 5, y: 400 } })
  await page.keyboard.press('c')
  await expect(period.locator('.range-cmp')).toHaveText('± vs before')
  await page.keyboard.press('c')
  await expect(period.locator('.range-cmp')).toHaveCount(0)
})

test('the pages with no comparison do not offer one', async ({ page }) => {
  await page.goto(`${API}/${HISTORY_DOMAIN}/links?period=30d`)
  await page.locator('.range-picker .btn.range').click()
  await expect(page.getByRole('dialog', { name: 'Choose a date range' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Compare' })).toHaveCount(0)
})

test('on a phone the comparison stays a row in the date sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=data&period=30d&compare=previous`)
  await expect(page.locator('.pr-date')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.cmp-btn, .range-cmp')).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
  if (SHOTS) {
    for (const scheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await page.screenshot({ path: `${SHOTS}/polish-period-390-${scheme}.png`, clip: { x: 0, y: 0, width: 390, height: 200 } })
    }
  }
})
