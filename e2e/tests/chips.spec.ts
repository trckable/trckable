// The moment chips on the Briefing chart: one tidy pill each on their own lane, a guide to the plot only while one is pointed at,
// and a structured tooltip (kind and day on a head row, the numbers under it, the other moments listed).
import { expect, test } from './fixtures'
import { flowSession } from './flows-kit'
import { API, STEADY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the chips')

const SHOTS = '/private/tmp/claude-501/-Users-albi-Projects-trckable/ca6f67f6-3760-464f-975f-418264032c74/scratchpad'
let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

for (const [width, colorScheme] of [[1280, 'dark'], [1280, 'light'], [390, 'dark']] as const) {
  test(`chips are pills with a structured tooltip, ${width}px ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await page.setViewportSize({ width, height: 900 })
    const day = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10)
    await page.route(/\/moments\?/, (r) =>
      r.fulfill({
        json: {
          moments: [
            { t: `${day(3)}T10:00`, kind: 'spike', factor: 2.1, referrer: 'google.com', visitors: 12 },
            { t: `${day(3)}T14:00`, kind: 'surge', factor: 2.5, referrer: 'news.ycombinator.com', visitors: 40 },
            { t: day(3), kind: 'milestone', family: 'visitors', value: 1000 },
            { t: day(9), kind: 'referrer', name: 'reddit.com', visitors: 30 },
            { t: day(14), kind: 'mention', mention: 'hn', visitors: 20, referrer: 'news.ycombinator.com' },
            { t: day(20), kind: 'spike', factor: 3, referrer: 'x.com', visitors: 50 },
          ],
        },
      }),
    )
    await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
    await page.goto(`${API}/${STEADY_DOMAIN}?view=briefing&period=30d&v=`)
    const chips = page.locator('.chwrap .moment-mark')
    await expect(chips.first()).toBeVisible({ timeout: 20_000 })
    // One pill each: 20px high, no two touching.
    const boxes = await chips.evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, h: b.height } }))
    for (const b of boxes) expect(Math.round(b.h)).toBe(20)
    const sorted = [...boxes].sort((a, b) => a.l - b.l)
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].l).toBeGreaterThan(sorted[i - 1].r)
    await expect(page.locator('.moment-guide')).toHaveCount(0)
    const own = chips.and(page.locator(':not(.record)'))
    const many = own.filter({ has: page.locator('.moment-n') }).first()
    const target = (await many.count()) ? many : own.first()
    await target.hover()
    const tip = page.locator('.moment-tip')
    await expect(tip).toBeVisible()
    await expect(tip.locator('.mt-head b')).not.toBeEmpty()
    await expect(tip.locator('.mt-day')).not.toBeEmpty()
    await expect(tip.locator('.mt-line')).not.toBeEmpty()
    await expect(tip).not.toContainText('Chips mark moments')
    await expect(page.locator('.moment-guide')).toHaveCount(1)
    const t = await tip.boundingBox()
    expect(t!.x).toBeGreaterThanOrEqual(0)
    expect(t!.x + t!.width).toBeLessThanOrEqual(width)
    expect(t!.width).toBeLessThanOrEqual(282)
    await page.waitForTimeout(250)
    await page.screenshot({ path: `${SHOTS}/chips-${width}-${colorScheme}.png` })
    await page.mouse.move(5, 5)
    await expect(page.locator('.moment-guide')).toHaveCount(0)
  })
}
