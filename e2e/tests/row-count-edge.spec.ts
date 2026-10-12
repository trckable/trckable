// A ranked list row keeps the same inner gap on both sides: the count sits as
// far from the right end of the row's track as the name does from the left.
// Pictures for the review: RC_SHOTS=<folder>.
import { expect, test, type Locator } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

const SHOTS = process.env.RC_SHOTS
test.use({ colorScheme: 'dark' })

// The gaps between the track's ends and the ink of the name and of the count.
async function gaps(row: Locator) {
  return row.evaluate((el) => {
    const ink = (node: Element | null) => {
      const r = document.createRange()
      r.selectNodeContents(node!)
      return r.getBoundingClientRect()
    }
    const track = el.querySelector('.bl-line')!.getBoundingClientRect()
    const name = ink(el.querySelector('.bl-name'))
    const count = ink(el.querySelector('.bl-val'))
    return { left: name.left - track.left, right: track.right - count.right }
  })
}

for (const width of [1440, 390]) {
  test(`the count keeps the name's inner gap at ${width}px, at rest and hovered`, async ({ page }) => {
    await page.context().addCookies([{ name: 'trckable_session', value: await session('row-count-edge'), url: API }])
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`${API}/${HISTORY_DOMAIN}?view=data&period=30d`)
    const row = page.locator('[data-card=who] .bl-row').first()
    await expect(row).toBeVisible({ timeout: 25_000 })
    await page.evaluate(() => document.fonts.ready)
    const rest = await gaps(row)
    expect(rest.left).toBeGreaterThan(4)
    expect(Math.abs(rest.right - rest.left)).toBeLessThanOrEqual(1)
    await row.hover()
    const hovered = await gaps(row)
    expect(Math.abs(hovered.right - hovered.left)).toBeLessThanOrEqual(1)
    if (SHOTS) await page.locator('[data-card=who]').screenshot({ path: `${SHOTS}/row-count-edge-${width}-dark.png` })
  })
}
