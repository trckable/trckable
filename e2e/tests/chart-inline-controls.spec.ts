// The period and the comparison are switched from Explore's period chip, and the chart and the address follow.
// Chromium only (a layout).
import { expect, test, type Page } from './fixtures'
import { flowSession } from './flows-kit'
import { API, STEADY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for a layout')

// Pictures for the review: CIC_SHOTS=<folder>.
const SHOTS = process.env.CIC_SHOTS
let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

/** The report with a known period before (150 + 7 i), and the period's own as 200 + i. */
async function withBefore(page: Page) {
  await page.route(/\/api\/v1\/sites\/[^/]+\/report\?/, async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    const series = (body.current.series as { t: string; visitors: number; pageviews: number }[]).map((p, i) => ({ ...p, visitors: 200 + i, pageviews: 200 + i }))
    body.current = { ...body.current, series }
    body.previous = { ...body.current, series: series.map((p, i) => ({ ...p, visitors: 150 + i * 7, pageviews: 150 })) }
    delete body.previous_series // the mock sets the period before whole
    await route.fulfill({ response: res, json: body })
  })
}

async function open(page: Page, width: number, scheme: 'dark' | 'light', query: string) {
  await page.setViewportSize({ width, height: width < 500 ? 844 : 900 })
  await page.emulateMedia({ colorScheme: scheme })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${STEADY_DOMAIN}${query}`)
  await expect(page.locator('svg#chart, .shp svg').first()).toBeVisible({ timeout: 20_000 })
  await page.evaluate(() => document.fonts.ready)
}

test('the period chip switches the period and the comparison, and the chart and the address follow', async ({ page }) => {
  await withBefore(page)
  await open(page, 1280, 'dark', '?view=briefing&period=30d&v=')
  // The row of segments over the chart is left out of the Explore page: the chip is the one place.
  const chip = page.locator('#xp .xperiod #xperBtn')
  await chip.click()
  await page.locator('#xperMenu').getByRole('button', { name: /^Last 90 days/ }).click()
  await expect(page).toHaveURL(/period=90d/)
  await chip.click()
  await page.locator('#xperMenu').getByRole('button', { name: /^Last 7 days/ }).click()
  await expect(page).toHaveURL(/period=7d/)
  // Compare: Before is the default (the usual band, or the dashed line where the site has no usual yet), Off turns it off and the dashed line goes.
  await expect(page.locator('svg#chart .chusual, svg#chart .chbefore')).toHaveCount(1)
  await chip.click()
  const seg = page.locator('#xperMenu .mk-lseg').first()
  await expect(seg.locator('button.on').first()).toHaveText('Before')
  // Last year needs a year of data: the steady site is younger, so the choice is there but disabled, with its reason.
  await expect(seg.getByRole('button', { name: 'Last year' })).toBeDisabled()
  await expect(seg.getByRole('button', { name: 'Last year' })).toHaveAttribute('title', 'Needs a year of data')
  await seg.getByRole('button', { name: 'Off' }).click()
  await expect(page).toHaveURL(/compare=none/)
  await expect(page.locator('.chbefore')).toHaveCount(0)
  // The page holds still (inert) while it reads the new period: the chip is pressed again until the menu opens.
  await expect(async () => {
    if (!(await seg.isVisible())) await chip.click()
    await expect(seg).toBeVisible({ timeout: 1000 })
  }).toPass()
  await seg.getByRole('button', { name: 'Before' }).click()
  await expect(page.locator('svg#chart .chusual, svg#chart .chbefore')).toHaveCount(1)
  // The point under the pointer is read out next to it, with both numbers.
  const box = (await page.locator('svg#chart').boundingBox())!
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
  await expect(page.locator('.chart-tip')).toHaveText(/^.+ · [\d,]+ (visitors|people) · .+ [\d,]+ · [+-]?\d+%$/)
})

for (const [scheme, width] of [['light', 1280], ['dark', 390]] as const) {
  test(`the chart on What changed does not overflow the page, ${scheme} ${width}px`, async ({ page }) => {
    await withBefore(page)
    await open(page, width, scheme, '?view=briefing&period=30d&v=')
    await page.waitForTimeout(1000)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}
