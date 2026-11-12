// Today against its usual: the soft band is the usual of the whole day, while the solid line stops at
// the hour it is. The figures over the chart stay against the same hours (the report's own comparison).
import { expect, test } from './fixtures'
import { flowSession } from './flows-kit'
import { API, STEADY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for a layout')
// In the day's last hour the solid line is within an hour of the end: the picture would not tell the two apart.
test.skip(() => new Date().getUTCHours() >= 23, 'the day is nearly over')

let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

test('with the comparison on, the usual band runs past now and the solid line stops there', async ({ page }, info) => {
  const asked: { sofar: boolean; whole: number; cut: number }[] = []
  page.on('response', async (res) => {
    const u = new URL(res.url())
    if (!/\/report$/.test(u.pathname) || u.searchParams.get('compare') !== 'previous' || u.searchParams.get('bucket') === 'day') return
    const body = (await res.json().catch(() => null)) as { previous?: { series: unknown[] }; previous_series?: unknown[] } | null
    if (body?.previous) asked.push({ sofar: u.searchParams.get('sofar') === '1', whole: body.previous_series?.length ?? 0, cut: body.previous.series.length })
  })
  // The site's history has traffic only from noon to about four, so its usual (the band) would end there: the weeks of
  // hours it is learned from are given visitors in every hour, and yesterday one day from midnight, whole in
  // previous_series and cut at now in previous.
  await page.route(/\/api\/v1\/sites\/[^/]+\/report\?/, async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    const cur = body.current?.series as { t: string }[] | undefined
    if (new URL(route.request().url()).searchParams.get('bucket') === 'hour' && cur && cur.length > 24) {
      body.current = { ...body.current, series: cur.map((p) => ({ ...p, visitors: 5 + new Date(p.t).getUTCHours(), pageviews: 5 + new Date(p.t).getUTCHours() })) }
    }
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
  // The usual is a band over the whole day, the hours still to come too.
  const band = page.locator('svg#chart .chusual')
  await expect(band).toHaveCount(1)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(1500)
  // It runs on past the hour it is (the dot), where the solid line stops.
  const dot = (await page.locator('svg#chart circle[r="4.5"]').boundingBox())!
  const range = (await band.boundingBox())!
  expect(range.x + range.width).toBeGreaterThan(dot.x + dot.width + 20)
  await expect.poll(() => asked.some((a) => a.sofar && a.whole === 24 && a.cut < 24)).toBe(true)
  await page.screenshot({ path: info.outputPath('fullday-dark-1280.png') })
})
