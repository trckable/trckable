// The Briefing's chart set against the period before (a dashed line, one line of words, the hover's own figures, a quiet
// note while there is too little before it), and what sits under the four cards: one incident card with the stretch the
// site was down drawn in red and "everything else was normal" as its last line, locked features as one slim row, the
// email row in the card style, and the same gap everywhere. Chromium only (a layout).
import { expect, test, type Page } from './fixtures'
import { flowSession } from './flows-kit'
import { API, STEADY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for a layout')

/** The site with two weeks behind it (it has a normal to be told against), opened signed in on the Briefing. */
async function open(page: Page, width: number, scheme: 'dark' | 'light') {
  await page.setViewportSize({ width, height: width < 500 ? 844 : 900 })
  await page.emulateMedia({ colorScheme: scheme })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${STEADY_DOMAIN}?view=briefing&period=30d&v=`)
  // Measured only once the fonts are in: their arrival re-wraps text and moves every box.
  await page.evaluate(() => document.fonts.ready)
}

let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

const REPORT = /\/api\/v1\/sites\/[^/]+\/report\?/
const WAS = (i: number, base: number) => base + i * 7

/** The report as the server gives it, with the period before's series replaced by known figures and the period's own by 200 + i. */
async function withBefore(page: Page, base: number) {
  await page.route(REPORT, async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    const series = (body.current.series as { t: string; visitors: number; pageviews: number }[]).map((p, i) => ({ ...p, visitors: 200 + i, pageviews: 200 + i }))
    body.current = { ...body.current, series }
    body.previous = { ...body.current, series: series.map((p, i) => ({ ...p, visitors: WAS(i, base), pageviews: WAS(i, base) })) }
    await route.fulfill({ response: res, json: body })
  })
}

const NOW = Math.floor(Date.now() / 1000)
const down = (from: number, min: number) => ({ id: `inc-${from}`, site: 'x', kind: 'down', started_at: NOW - from * 86400, ended_at: NOW - from * 86400 + min * 60, cause: 'timeout', expected_visits: 4, note: '' })

/** An incident or two inside the last 30 days, as the incident record gives them. */
async function withIncidents(page: Page) {
  const list = [down(20, 23), down(3, 23)]
  await page.route('**/api/v1/sites/*/incidents?*', (r) => r.fulfill({ json: new URL(r.request().url()).searchParams.has('from') ? { incidents: list, summary: { count: 2, seconds: 2760, lost: 8, lost_some: false } } : { incidents: list, next_before: null } }))
}

const note = (page: Page) => page.locator('#chNote')

for (const [name, base, tone, sign] of [
  ['above', 100, 'up', '+'],
  ['below', 900, 'dn', '-'],
] as const) {
  test(`the chart says how the period stands against the one before, ${name} it, from the report's own figures`, async ({ page }) => {
    await withBefore(page, base)
    await open(page, 1440, 'dark')
    await expect(page.locator('svg#chart')).toBeVisible()
    await expect(page.locator('svg#chart .chbefore')).toHaveCount(1)
    expect(await page.locator('svg#chart .chbefore').getAttribute('stroke-dasharray')).toBeTruthy()
    // The standing line: the change, in green or red, no box.
    await expect(note(page)).toHaveText(new RegExp(`^\\${sign}\\d+% vs last month$`))
    await expect(note(page)).toHaveAttribute('data-tone', tone)
    // The hover: the point, the one before it from the same report, and the change between them.
    const HOVER = /^.+ · [\d,]+ visitors · last month [\d,]+ · [+-]?\d+%$/
    for (const at of [0.2, 0.5, 0.8]) {
      // The chart's box is read again for each move (it can still settle), and the hover is waited for, not read at once.
      const box = (await page.locator('svg#chart').boundingBox())!
      await page.mouse.move(box.x + box.width * at, box.y + box.height * 0.6)
      await expect(note(page)).toHaveText(HOVER)
      const read = (await note(page).innerText()).replace(/,/g, '')
      const m = /^.+ · (\d+) visitors · last month (\d+) · ([+-]?\d+)%$/.exec(read)
      expect(m, read).not.toBeNull()
      const [v, was, pct] = [Number(m![1]), Number(m![2]), Number(m![3])]
      expect(was).toBe(WAS(v - 200, base))
      expect(pct).toBe(Math.round(((v - was) / was) * 100))
      expect(read).not.toMatch(/usual|0–0/)
    }
  })
}

test('with too little before it the chart draws no line and says when the comparison begins', async ({ page }) => {
  await open(page, 1440, 'dark')
  await expect(page.locator('svg#chart')).toBeVisible()
  await expect(page.locator('svg#chart .chbefore')).toHaveCount(0)
  await expect(note(page)).toHaveText(/^Comparison starts .+, once there's a month of data$/)
  const box = (await page.locator('svg#chart').boundingBox())!
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.6)
  await expect(note(page)).not.toHaveText(/usual|0–0/)
})

test('one incident card: the down stretches in red, everything else was normal as its last line, one primary action, no way deeper', async ({ page }) => {
  await withIncidents(page)
  await open(page, 1440, 'dark')
  const card = page.locator('.icard.inc')
  await expect(card).toBeVisible()
  const marks = card.locator('.obt i')
  await expect(marks).toHaveCount(2)
  for (const m of await marks.all()) expect((await m.boundingBox())!.width).toBeGreaterThanOrEqual(3)
  await expect(card.locator('.ic-calm')).toContainText('No other unusual changes in')
  expect(await card.evaluate((el) => el.lastElementChild?.className)).toContain('ic-calm')
  await expect(page.locator('.calm2')).toHaveCount(0)
  await expect(card.getByRole('button', { name: 'Open the incident' })).toBeVisible()
  await expect(card.getByRole('button', { name: 'Watch' })).toBeVisible()
  await expect(card.getByRole('button', { name: 'Why?' })).toBeVisible()
  await expect(card.locator('[data-deeper]')).toHaveCount(0)
})

for (const width of [360, 768, 1440] as const) {
  test(`locked features are a slim row, the email is one quiet line, and every gap is the cards' gap, ${width}px`, async ({ page }) => {
    await withIncidents(page)
    await open(page, width, 'light')
    await expect(page.locator('.lkcs .lkc.row').first()).toBeVisible()
    const measure = () => page.locator('.lkcs .lkc.row').evaluateAll((els) => els.map((e) => ({ ...e.getBoundingClientRect().toJSON(), go: getComputedStyle(e.querySelector('.lkgo')!).backgroundColor })))
    await expect.poll(async () => (await measure()).length).toBeGreaterThanOrEqual(1)
    // Two reads that agree: the layout has stopped moving.
    await expect.poll(async () => JSON.stringify(await measure()), { intervals: [100, 200, 400] }).toBe(JSON.stringify(await measure()))
    const rows = await measure()
    for (const r of rows) {
      expect(r.height).toBeLessThanOrEqual(width < 500 ? 100 : 84)
      expect(r.go).toBe('rgba(0, 0, 0, 0)')
    }
    // One nudge at a time: the first thing not set up is the one slim row.
    expect(rows).toHaveLength(1)
    await expect(page.locator('.lkcs .how')).toHaveCount(0)
    // The email is one quiet line over the Briefing, no box, with one Change.
    await expect(page.locator('.mailline')).toContainText('Emailed daily at 08:00')
    await expect(page.locator('.mailline').getByRole('button')).toHaveCount(1)
    const gaps = await page.evaluate(() => {
      const top = (s: string) => document.querySelector(s)!.getBoundingClientRect()
      const seq = ['.kcs', '.brief > .cards', '.lkcs']
      return { kcs: parseFloat(getComputedStyle(document.querySelector('.kcs')!).rowGap), between: seq.slice(1).map((s, i) => Math.round(top(s).top - top(seq[i]).bottom)) }
    })
    for (const g of gaps.between) expect(g).toBe(gaps.kcs)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
  })
}

test('a week by the hour is set against the week before by the hour: the dashed line runs the whole chart, on the same scale, with a legend', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${STEADY_DOMAIN}?view=briefing&period=7d&v=`)
  await expect(page.locator('svg#chart')).toBeVisible()
  const dash = page.locator('svg#chart .chbefore')
  await expect(dash).toHaveCount(1)
  // Its buckets are the line's own: the first to the last point cover (nearly) the width of the plot, not a stretch at its start.
  // The week is drawn by the hour once that report is in: wait for it, not for the first (daily) drawing.
  await expect.poll(async () => ((await dash.getAttribute('points')) ?? '').split(' ').length).toBeGreaterThan(24)
  const xs = ((await dash.getAttribute('points')) ?? '').split(' ').map((p) => Number(p.split(',')[0]))
  const line = ((await page.locator('svg#chart polyline').first().getAttribute('points')) ?? '').split(' ').map((p) => Number(p.split(',')[0]))
  expect(xs.length).toBeGreaterThan(24)
  expect(xs[xs.length - 1] - xs[0]).toBeGreaterThan((line[line.length - 1] - line[0]) * 0.9)
  await expect(page.locator('.chkey')).toContainText('This period')
  await expect(page.locator('.chkey')).toContainText('Last week')
})
