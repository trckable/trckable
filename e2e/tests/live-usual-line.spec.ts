// Live's first card: today's people have one quiet line under the figures that says how far it stands from a usual day of the
// week, with its tone on the arrow and the figure only. No caps pill beside the number.
import { expect, test } from './fixtures'
import { flowSession } from './flows-kit'
import { API, STEADY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for a layout')

let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

const SHOTS = 'test-results/shots'

for (const [scheme, width] of [['dark', 1280], ['light', 1280], ['dark', 390]] as const) {
  test(`the usual line sits under the figures, ${scheme} ${width}px`, async ({ page }) => {
    await page.route(/\/api\/v1\/sites\/[^/]+\/now(\?|$)/, async (route) => {
      const res = await route.fetch()
      const body = await res.json()
      body.today = { visitors: 1379, before: 1045, compare: true, hours: [], last: [] }
      await route.fulfill({ response: res, json: body })
    })
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 })
    await page.emulateMedia({ colorScheme: scheme })
    await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
    await page.goto(`${API}/${STEADY_DOMAIN}?view=live&v=`)
    const card = page.locator('.lnow')
    const line = card.locator('.lusual')
    await expect(line).toHaveText(/^Today 1,379 people · ↑ 32% above a usual \w+$/)
    await expect(card.locator('.mk-tag')).toHaveCount(0)
    await expect(page.locator('.lan .lusual')).toHaveCount(0) // told once, not again on Analytics
    // Under the two figures, not beside them.
    const figs = (await card.locator('.lfig').boundingBox())!
    const under = (await line.boundingBox())!
    expect(under.y).toBeGreaterThanOrEqual(figs.y + figs.height - 2)
    await page.evaluate(() => document.fonts.ready)
    await card.scrollIntoViewIfNeeded()
    await card.screenshot({ path: `${SHOTS}/usual-${scheme}-${width}.png` })
  })
}
