// The period button and the comparison words beside it are two controls: the
// space between them is the toolbar's own gap, never less.
// Pictures for the review: CG_SHOTS=<folder> CG_SCHEME=light|dark.
import { expect, test } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

const SHOTS = process.env.CG_SHOTS
const SCHEME = process.env.CG_SCHEME === 'light' ? 'light' : 'dark'
test.use({ colorScheme: SCHEME })

for (const width of [1440, 1280, 800]) {
  test(`the comparison sits a toolbar gap from the period at ${width}px`, async ({ page }) => {
    await page.context().addCookies([{ name: 'trckable_session', value: await session('compare-gap'), url: API }])
    await page.setViewportSize({ width, height: 844 })
    await page.goto(`${API}/${HISTORY_DOMAIN}?view=data&period=30d&compare=previous`)
    const period = page.locator('.ctl-cap .btn.range')
    const compare = page.locator('.ctl-cap .btn.cmp-btn.on')
    await expect(period).toBeVisible({ timeout: 15_000 })
    await expect(compare).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/compare-gap-${width}-${SCHEME}.png`, clip: { x: 0, y: 0, width, height: 150 } })
    const a = (await period.boundingBox())!
    const b = (await compare.boundingBox())!
    const toolbar = await page.locator('.subbar').evaluate((el) => parseFloat(getComputedStyle(el).columnGap))
    expect(toolbar).toBeGreaterThan(0)
    expect(b.x - (a.x + a.width)).toBeGreaterThanOrEqual(toolbar)
  })
}

test('on a phone the comparison is a row in the date sheet, so no two pills meet', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('compare-gap'), url: API }])
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=data&period=30d&compare=previous`)
  await expect(page.locator('.pr-date')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.ctl-cap .btn.cmp-btn')).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/compare-gap-390-${SCHEME}.png`, clip: { x: 0, y: 0, width: 390, height: 300 } })
})
