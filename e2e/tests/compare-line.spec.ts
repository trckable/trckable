// Every period chart sets the period against the one before, from the same report: a dashed line beside the solid one, a
// key that names it, a hover that reads both figures and the change, and, while the Replay runs (it hides the line of words
// over the chart), the key and the people count still there, the count clear of the markers. Chromium only (a layout).
import { expect, test, type Page } from './fixtures'
import { flowSession } from './flows-kit'
import { API, STEADY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for a layout')

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

async function open(page: Page, width: number, scheme: 'dark' | 'light', query = '?view=briefing&period=30d&v=') {
  await page.setViewportSize({ width, height: width < 500 ? 844 : 900 })
  await page.emulateMedia({ colorScheme: scheme })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${STEADY_DOMAIN}${query}`)
  await expect(page.locator('svg#chart, .shp svg').first()).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
}

test('Explore\'s shape of the period draws the period before and reads both figures on hover', async ({ page }) => {
  await withBefore(page)
  await open(page, 1280, 'dark', '?view=briefing&period=30d&v=&x=overview')
  const dash = page.locator('.shp .shbefore')
  await expect(dash).toHaveCount(1)
  expect(await dash.getAttribute('stroke-dasharray')).toBeTruthy()
  await expect(page.locator('.shp .chkey')).toContainText('This period')
  const box = (await page.locator('.shp svg').boundingBox())!
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
  await expect(page.locator('.shp .shtip')).toHaveText(/^.+ · [\d,]+ visitors · .+ [\d,]+ · [+-]?\d+%$/)
  await page.screenshot({ path: '/private/tmp/claude-501/-Users-albi-Projects-trckable/ca6f67f6-3760-464f-975f-418264032c74/scratchpad/compare-explore-dark-1280.png' })
})

test('the compare control says why when the period before has too little behind it', async ({ page }) => {
  await open(page, 1280, 'dark')
  await page.locator('#xp .xperiod #xperBtn').click()
  await expect(page.locator('.cmpnote')).toContainText('Comparison starts')
})
