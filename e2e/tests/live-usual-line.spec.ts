// Live's Analytics card: today's number has one quiet line under it that says how far it stands from a usual day of the
// week, with its tone on the arrow and the figure only. No caps pill beside the number.
import { expect, test } from './fixtures'
import { flowSession } from './flows-kit'
import { API, STEADY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for a layout')

let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

const SHOTS = '/private/tmp/claude-501/-Users-albi-Projects-trckable/ca6f67f6-3760-464f-975f-418264032c74/scratchpad'

for (const [scheme, width] of [['dark', 1280], ['light', 1280], ['dark', 390]] as const) {
  test(`the usual line sits under today's number, ${scheme} ${width}px`, async ({ page }) => {
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
    const card = page.locator('.lan')
    await expect(card.locator('.lhero')).toContainText('1,379')
    const line = card.locator('.lusual')
    await expect(line).toHaveText(/^↑ 32% above a usual \w+$/)
    await expect(card.locator('.mk-tag')).toHaveCount(0)
    // Directly under the number, not beside it.
    const hero = (await card.locator('.lhero').boundingBox())!
    const under = (await line.boundingBox())!
    expect(under.y).toBeGreaterThanOrEqual(hero.y + hero.height - 2)
    await page.evaluate(() => document.fonts.ready)
    await card.scrollIntoViewIfNeeded()
    await card.screenshot({ path: `${SHOTS}/usual-${scheme}-${width}.png` })
  })
}
