// The period and the comparison are switched from right over the chart, and the header's chip and the address follow.
// Chromium only (a layout).
import { expect, test, type Page } from './fixtures'
import { flowSession } from './flows-kit'
import { API, STEADY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for a layout')

const SHOTS = '/private/tmp/claude-501/-Users-albi-Projects-trckable/ca6f67f6-3760-464f-975f-418264032c74/scratchpad'
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
    await route.fulfill({ response: res, json: body })
  })
}

async function open(page: Page, width: number, scheme: 'dark' | 'light', query: string) {
  await page.setViewportSize({ width, height: width < 500 ? 844 : 900 })
  await page.emulateMedia({ colorScheme: scheme })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${STEADY_DOMAIN}${query}`)
  await expect(page.locator('svg#chart, .shp svg').first()).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
}

test('the period and Compare switch over the chart, and the header chip and the address follow', async ({ page }) => {
  await withBefore(page)
  await open(page, 1280, 'dark', '?view=briefing&period=30d&v=')
  const row = page.locator('.chwrap [data-testid=chart-controls]')
  await expect(row.getByRole('radio', { name: '30d' })).toHaveAttribute('aria-checked', 'true')
  await row.getByRole('radio', { name: '90d' }).click()
  await expect(page).toHaveURL(/period=90d/)
  await expect(page.locator('#perBtn')).toContainText(/90/)
  // Arrow keys move within the segments.
  await row.getByRole('radio', { name: '90d' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(/period=12mo/)
  await row.getByRole('radio', { name: '7d' }).click()
  await expect(page).toHaveURL(/period=7d/)
  // The switch: on is the default, Space turns it off, and the dashed line goes.
  const sw = row.getByRole('switch', { name: 'Compare' })
  await expect(sw).toHaveAttribute('aria-checked', 'true')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${SHOTS}/inline-on-dark-1280.png` })
  await sw.focus()
  await page.keyboard.press('Space')
  await expect(sw).toHaveAttribute('aria-checked', 'false')
  await expect(page).toHaveURL(/compare=none/)
  await expect(page.locator('svg#chart .chbefore')).toHaveCount(0)
  await sw.click()
  await expect(sw).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('svg#chart .chbefore')).toHaveCount(1)
  // Last year needs a year of data: the steady site is younger, so the choice is there but disabled.
  await expect(row.getByRole('radio', { name: 'Same time last year' })).toHaveAttribute('aria-disabled', 'true')
  // The header's menu shows the same comparison.
  await page.locator('#perBtn').click()
  await expect(page.locator('#perMenu .mk-lseg button.on').first()).toHaveText('Before')
})

for (const [scheme, width] of [['light', 1280], ['dark', 390]] as const) {
  test(`the row over the chart, ${scheme} ${width}px`, async ({ page }) => {
    await withBefore(page)
    await open(page, width, scheme, '?view=briefing&period=30d&v=')
    await page.waitForTimeout(2000)
    const row = (await page.locator('[data-testid=chart-controls]').boundingBox())!
    expect(row.height).toBeLessThanOrEqual(34)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: `${SHOTS}/inline-on-${scheme}-${width}.png` })
  })
}

test('Explore\'s shape has the same row', async ({ page }) => {
  await withBefore(page)
  await open(page, 1280, 'dark', '?view=briefing&period=30d&v=&x=overview')
  const row = page.locator('.shp').locator('xpath=preceding-sibling::*[@data-testid="chart-controls"]')
  await row.getByRole('radio', { name: '90d' }).click()
  await expect(page).toHaveURL(/period=90d/)
})
