// Live's first card: today's people are the third figure beside the other two, with how far it stands from a usual day of the
// week under it in the delta line's style. No caps pill beside the number.
import { expect, test } from './fixtures'
import { flowSession } from './flows-kit'
import { API, STEADY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for a layout')

let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

const SHOTS = '/private/tmp/claude-501/-Users-albi-Projects-trckable/67e04447-8ff7-4cd5-9bf6-047f7f69ccfa/scratchpad/shots'

for (const [scheme, width] of [['dark', 1440], ['light', 1440], ['light', 768], ['light', 390], ['dark', 360]] as const) {
  test(`today is the third figure, ${scheme} ${width}px`, async ({ page }) => {
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
    const stat = card.locator('.lfig .ltoday')
    await expect(stat.locator('.ll')).toHaveText('Today')
    await expect(stat.locator('.lbign .rn-text').first()).toHaveText('1,379')
    await expect(stat.locator('.mk-ld.up')).toHaveText(/^↑32% vs a usual \w+$/)
    await expect(card.locator('.mk-tag')).toHaveCount(0)
    await expect(page.locator('.lan .ltoday')).toHaveCount(0) // told once, not again on Analytics
    // Same type size as the half hour's figure, and no sideways scroll.
    const size = (loc: typeof stat) => loc.locator('.lbign').evaluate((e) => getComputedStyle(e).fontSize)
    expect(await size(stat)).toBe(await size(card.locator('.lfig .lside').first()))
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.evaluate(() => document.fonts.ready)
    await card.scrollIntoViewIfNeeded()
    await card.screenshot({ path: `${SHOTS}/live-today-${scheme}-${width}.png` })
  })
}
