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

for (const [width, colorScheme] of [[1280, 'dark'], [390, 'dark']] as const) {
  test(`the head shares one left edge and tells the truth about the range, ${width}px`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await page.setViewportSize({ width, height: 900 })
    await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
    await page.goto(`${API}/${STEADY_DOMAIN}?view=briefing&period=30d&v=`)
    const status = page.locator('#chNote')
    await expect(status).toBeVisible({ timeout: 20_000 })
    // Comparison has not begun: the line says the range is being built, never "Normal overall" or a count outside a band.
    await expect(status).toHaveText(/^Building your usual range · ready [A-Z][a-z]{2} \d{1,2}$/)
    await expect(page.locator('.chwrap')).not.toContainText('days outside the usual band')
    const left = async (sel: string) => Math.round((await page.locator(sel).first().boundingBox())!.x)
    const chips = await left('.cc-period button')
    expect(await left('#chNote')).toBe(chips)
    expect(await left('.chno')).toBe(chips)
    // The rows' gaps: 16px between the groups (status, period), 8px between the period and its note.
    const box = async (sel: string) => (await page.locator(sel).first().boundingBox())!
    const s = await box('#chNote')
    const c = await box('.cc')
    const n = await box('.chno')
    expect(Math.round(c.y - (s.y + s.height))).toBeLessThanOrEqual(18)
    expect(Math.round(n.y - (c.y + c.height))).toBeLessThanOrEqual(10)
    await page.screenshot({ path: `${SHOTS}/briefhead-${width}-${colorScheme}.png`, clip: { x: 0, y: 0, width, height: 620 } })
  })
}
