// The chart's head on What changed: while the usual
// range is still being built the standing line says so and counts nothing against it.
import { expect, test } from './fixtures'
import { flowSession } from './flows-kit'
import { API, STEADY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the head')

let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

for (const [width, colorScheme] of [[1280, 'dark'], [1280, 'light'], [390, 'dark']] as const) {
  test(`the head is the buttons and one chip row, and tells the truth about the range, ${width}px ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await page.setViewportSize({ width, height: 900 })
    await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
    await page.goto(`${API}/${STEADY_DOMAIN}?view=briefing&period=30d&v=`)
    await expect(page.locator('svg#chart')).toBeVisible({ timeout: 20_000 })
    // The comparison has not begun: one pill says how much of the usual range there is, and nothing counts days outside it.
    const pill = page.locator('.cc-learn')
    await expect(pill).toBeVisible()
    await expect(pill).toContainText(/Usual range \d+\/30 days/)
    await expect(pill).toHaveAttribute('title', /Comparison starts [A-Z][a-z]{2} \d{1,2}/)
    await expect(page.locator('.xchg-chart')).not.toContainText('days outside the usual band')
    await expect(page.locator('.chno')).toHaveCount(0)
    await expect(page.locator('#xp')).not.toContainText('Record day')
    // The record day is a star on the chart, with its sentence as the tooltip.
    const star = page.locator('.moment-mark.record')
    if (await star.count()) {
      await star.hover()
      await expect(page.locator('.moment-tip')).toContainText('Busiest day in 90 days')
      await page.mouse.move(2, 2)
    }
  })
}
