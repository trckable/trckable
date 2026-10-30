// The Briefing's head: the actions, the standing line and the period with its note share one left edge, and while the usual
// range is still being built the standing line says so and counts nothing against it.
import { expect, test } from './fixtures'
import { flowSession } from './flows-kit'
import { API, STEADY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the head')

const SHOTS = '/private/tmp/claude-501/-Users-albi-Projects-trckable/ca6f67f6-3760-464f-975f-418264032c74/scratchpad'
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
    const chips = page.locator('.cc-period button').first()
    await expect(chips).toBeVisible({ timeout: 20_000 })
    // The comparison has not begun: one pill on the chip row says how much of the usual range there is, and nothing counts days outside it.
    const pill = page.locator('.cc-learn')
    await expect(pill).toContainText(/Usual range \d+\/30 days/)
    await expect(pill).toHaveAttribute('title', /Comparison starts [A-Z][a-z]{2} \d{1,2}/)
    await expect(page.locator('.chwrap')).not.toContainText('days outside the usual band')
    await expect(page.locator('.chno')).toHaveCount(0)
    await expect(page.locator('.hero .moments .mline')).toHaveCount(0)
    await expect(page.locator('.hero')).not.toContainText('Record day')
    // The row under the buttons is one row: the period, the pill and the controls share a line, and the chart follows.
    const row = await page.locator('.cc').boundingBox()
    const pb = await pill.boundingBox()
    const cb = await chips.boundingBox()
    expect(Math.abs(pb!.y + pb!.height / 2 - (cb!.y + cb!.height / 2))).toBeLessThan(4)
    expect(Math.round(cb!.x)).toBeLessThanOrEqual(Math.round(row!.x) + 8)
    const notes = await page.locator('.nbtn').boundingBox()
    expect(Math.abs(notes!.y + notes!.height / 2 - (cb!.y + cb!.height / 2))).toBeLessThan(4)
    // Nothing between the buttons and that row but the key numbers and a gap.
    const buttons = await page.locator('.hero .rpb').first().boundingBox()
    const nums = await page.locator('.hero .nrow').boundingBox()
    expect(nums!.y).toBeGreaterThanOrEqual(buttons!.y + buttons!.height)
    // (A phone stacks its buttons and puts the score card between them and the row.)
    if (width > 600) expect(row!.y - (nums!.y + nums!.height)).toBeLessThanOrEqual(40)
    // The record day is a star on the chart, with its sentence as the tooltip.
    const star = page.locator('.moment-mark.record')
    if (await star.count()) {
      await star.hover()
      await expect(page.locator('.moment-tip')).toContainText('Busiest day in 90 days')
      await page.mouse.move(2, 2)
    }
    await page.waitForTimeout(2500)
    await page.screenshot({ path: `${SHOTS}/briefhead-after-${width}-${colorScheme}.png`, clip: { x: 0, y: 0, width, height: 700 } })
  })
}
