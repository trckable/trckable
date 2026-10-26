// Today set against yesterday: the dashed line is the whole day before, hour 0 to 23, while the solid line stops at
// the hour it is. The figures over the chart stay against the same hours (the report's own comparison).
import { expect, test } from './fixtures'
import { flowSession } from './flows-kit'
import { API, STEADY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for a layout')
// Late in the day the solid line is close to the end anyway: the picture would not tell the two apart.
test.skip(() => new Date().getUTCHours() >= 21, 'the day is nearly over')

let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

test('with the comparison on, the dashed line runs the whole day before and the solid line stops at now', async ({ page }) => {
  const asked: { sofar: boolean; whole: number; cut: number }[] = []
  page.on('response', async (res) => {
    const u = new URL(res.url())
    if (!/\/report$/.test(u.pathname) || u.searchParams.get('compare') !== 'previous' || u.searchParams.get('bucket') === 'day') return
    const body = (await res.json().catch(() => null)) as { previous?: { series: unknown[] }; previous_series?: unknown[] } | null
    if (body?.previous) asked.push({ sofar: u.searchParams.get('sofar') === '1', whole: body.previous_series?.length ?? 0, cut: body.previous.series.length })
  })
  // The site's yesterday has traffic only from noon, which the chart does not count as a day before: it is given one from midnight, whole in previous_series and cut at now in previous.
  await page.route(/\/api\/v1\/sites\/[^/]+\/report\?/, async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    const cur = body.current?.series as { t: string }[] | undefined
    if (body.previous && body.previous_series && cur?.length === 24) {
      const day = body.previous_series.map((p: { t: string }, h: number) => ({ ...p, visitors: 5 + h, pageviews: 5 + h }))
      body.previous = { ...body.previous, series: day.slice(0, body.previous.series.length) }
      body.previous_series = day
    }
    await route.fulfill({ response: res, json: body })
  })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${STEADY_DOMAIN}?view=briefing&period=today&compare=previous&v=`)
  const dashed = page.locator('svg#chart .chbefore')
  await expect(dashed).toHaveCount(1)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(1500)
  const hours = (await dashed.getAttribute('points'))!.trim().split(/\s+/).length
  expect(hours).toBeGreaterThanOrEqual(20)
  // It reaches the right-hand end of the plot, though the hour is far from it.
  const svg = (await page.locator('svg#chart').boundingBox())!
  const line = (await dashed.boundingBox())!
  expect(line.x + line.width).toBeGreaterThan(svg.x + svg.width * 0.85)
  expect(asked.some((a) => a.sofar && a.whole === 24 && a.cut < 24)).toBe(true)
  await page.screenshot({ path: '/private/tmp/claude-501/-Users-albi-Projects-trckable/ca6f67f6-3760-464f-975f-418264032c74/scratchpad/fullday-dark-1280.png' })
})
