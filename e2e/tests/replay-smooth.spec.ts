// The Briefing's Replay is one prepared story, not a page rebuilding itself: the chart's frame and axes never change
// (only the line is drawn on), nothing shifts (CLS exactly 0, with no room kept for it while idle), the button keeps its
// width and says Stop while it plays, Esc and Skip end it, the end is exactly the still chart, and reduced motion shows
// the end at once.
import { expect, test, type Page } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'
import { newSite, recent, visit, type TestSite } from './audit-kit'

test.skip(({ browserName }) => browserName !== 'chromium', 'one browser is enough: the page is the same')

let cookie = ''
test.beforeAll(async () => {
  cookie = await session('replay-smooth')
})

/** A site with visits spread over the hours of today so far (the day replays only once an hour has passed). */
async function today(page: Page): Promise<TestSite> {
  const now = new Date()
  const hours = now.getUTCHours()
  test.skip(hours < 2, 'a replay of the day needs a couple of hours behind it')
  const site = await newSite(page, 'replay')
  for (let i = 0; i < 36; i++) {
    const ago = ((i * 53) % (hours * 60 - 5)) * 60_000 + 60_000
    await visit(page.request, site, i % 2 ? '/pricing' : '/', { age: ago, id: `r${i}${Date.now()}` })
  }
  await expect.poll(async () => (await recent(page.request, site)).length, { timeout: 20_000 }).toBeGreaterThan(30)
  return site
}

async function open(page: Page, domain: string, query: string, width = 1440) {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.setViewportSize({ width, height: 1000 })
  // The clock of the page stands still (its timers run), so "now" and the usual band of the hour do not drift between two pictures.
  await page.clock.setFixedTime(Date.now())
  await page.goto(`${API}/${domain}${query}`)
  await expect(page.locator('svg#chart')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('[data-replay]')).toBeVisible()
  // The page is whole before the run is measured: its cards come in behind the chart, and their arrival is not the run's.
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)
  // The chart settles as what it is told by arrives (the usual band, the moments): wait until it stops changing.
  for (let i = 0; i < 20; i++) {
    const a = await still(page)
    await page.waitForTimeout(500)
    if ((await still(page)).equals(a)) break
  }
}

/** Watches the page frame by frame: what shifts, and whether the chart's frame, axes and line ever change. */
async function watch(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __w: Record<string, unknown> }
    const m = (w.__w = { cls: 0, axis: new Set<string>(), line: new Set<string>(), width: new Set<number>(), names: new Set<string>(), clip: false, ticks: 0, shifts: [] as string[] })
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { const s = e as unknown as { hadRecentInput: boolean; value: number; sources: { node: Element | null }[] }; if (!s.hadRecentInput) { m.cls = (m.cls as number) + s.value; (m.shifts as string[]).push(`${s.value.toFixed(5)} ${s.sources.map((x) => (x.node as HTMLElement | null)?.className || x.node?.nodeName).join(',')}`) } })).observe({ type: 'layout-shift' })
    const tick = () => {
      const svg = document.querySelector('svg#chart')
      if (svg) {
        ;(m.axis as Set<string>).add([...svg.querySelectorAll('text')].slice(0, 8).map((t) => t.textContent).join('|'))
        ;(m.line as Set<string>).add(svg.querySelector('polyline')?.getAttribute('points') ?? '')
        if (svg.querySelector('[clip-path]')) m.clip = true
      }
      const b = document.querySelector('[data-replay]')
      if (b) {
        ;(m.width as Set<number>).add(Math.round(b.getBoundingClientRect().width))
        ;(m.names as Set<string>).add((b as HTMLElement).innerText.trim())
      }
      m.ticks = (m.ticks as number) + 1
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

async function report(page: Page) {
  return page.evaluate(() => {
    const m = (window as unknown as { __w: Record<string, unknown> }).__w
    return { cls: m.cls as number, axis: (m.axis as Set<string>).size, line: (m.line as Set<string>).size, width: [...(m.width as Set<number>)], names: [...(m.names as Set<string>)], clip: m.clip as boolean, shifts: m.shifts as string[] }
  })
}

/** The chart as pixels, with the pulsing "now" dot and the shade of the hours to come out of it (both move with the clock). */
async function still(page: Page) {
  await page.addStyleTag({ content: 'svg#chart circle,svg#chart rect[fill="url(#mk-future)"]{visibility:hidden}' })
  return page.locator('svg#chart').screenshot()
}

/** The chart's markup without what a replay writes on (the clip's width and the tip's place, which stay in it unused), and the labels' measured offsets to a tenth of a pixel (a text measured twice differs in the last digits). */
const markup = (page: Page) => page.locator('svg#chart').evaluate((e) => e.outerHTML.replace(/<clipPath.*?<\/clipPath>/, '').replace(/<circle data-rv-tip[^>]*>/, '').replace(/(data-d[xy]=")(-?[\d.]+)"/g, (_, a, n) => `${a}${Number(n).toFixed(1)}"`))

let lastBox = ''

/** How many pixels of two pictures differ by more than a hair (decoded in the page, so no library is needed). */
async function apart(page: Page, a: Buffer, b: Buffer): Promise<number> {
  const blank = await page.context().newPage() // the dashboard's own page does not let a data: address be read
  await blank.goto('about:blank')
  const n = await blank.evaluate(async ([x, y]) => {
    const read = async (b64: string) => {
      const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
      const c = new OffscreenCanvas(bmp.width, bmp.height)
      const g = c.getContext('2d')!
      g.drawImage(bmp, 0, 0)
      return g.getImageData(0, 0, bmp.width, bmp.height)
    }
    const [p, q] = [await read(x), await read(y)]
    if (p.width !== q.width || p.height !== q.height) return Infinity
    let n = 0
    let [x0, y0, x1, y1] = [1e9, 1e9, -1, -1]
    // Not the last two rows: the picture's own edge may be touched by what sits under the chart.
    for (let i = 0; i < p.data.length - 8 * p.width; i += 4) if (Math.abs(p.data[i] - q.data[i]) + Math.abs(p.data[i + 1] - q.data[i + 1]) + Math.abs(p.data[i + 2] - q.data[i + 2]) > 24) { n++; const k = i / 4; const [cx, cy] = [k % p.width, Math.floor(k / p.width)]; x0 = Math.min(x0, cx); y0 = Math.min(y0, cy); x1 = Math.max(x1, cx); y1 = Math.max(y1, cy) }
    ;(window as unknown as { box: string }).box = `${x0},${y0}-${x1},${y1} of ${p.width}x${p.height}`
    return n
  }, [a.toString('base64'), b.toString('base64')] as const)
  lastBox = await blank.evaluate(() => (window as unknown as { box?: string }).box ?? '')
  await blank.close()
  return n
}

/** The chart now is the chart before: the same markup, and the same picture (a hair of antialiasing and the very bottom edge aside). */
async function same(page: Page, before: { html: string; png: Buffer }) {
  expect(await markup(page), 'the markup after the run is the markup before it').toBe(before.html)
  const now = await still(page)
  const n = await apart(page, before.png, now)
  if (n >= 40) {
    const { writeFileSync } = await import('node:fs')
    writeFileSync(test.info().outputPath('before.png'), before.png)
    writeFileSync(test.info().outputPath('after.png'), now)
  }
  expect(n, `pixels that differ (before.png and after.png are kept): ${lastBox}`).toBeLessThan(40)
}

const playing = (page: Page) => page.getByRole('button', { name: 'Stop', exact: true })
const idle = (page: Page) => page.getByRole('button', { name: 'Replay', exact: true })
const bar = (page: Page) => page.locator('.rp-bar')
const wrap = (page: Page) => page.locator('.rp-wrap')

/** The height of the chart's block: nothing is kept in it for a replay while none is up. */
const blockHeight = (page: Page) => page.locator('.chwrap').evaluate((e) => Math.round(e.getBoundingClientRect().height))

/** The run is judged the same way every time: nothing shifted, the frame and the line stayed, the button kept one width. */
async function steady(page: Page, names: string[]) {
  const r = await report(page)
  expect(r.cls, `what shifted: ${r.shifts.join(' | ')}`).toBe(0)
  expect(r.axis).toBe(1)
  expect(r.line).toBe(1)
  expect(r.width).toHaveLength(1)
  expect(r.names.sort()).toEqual(names)
  return r
}

/** The wrap-up's number is the count the HUD ended on, and the period's own. */
async function exact(page: Page) {
  const said = (await wrap(page).innerText()).match(/:\s([\d,]+)\s/)?.[1]
  expect(said, 'the wrap-up says how many people').toBeTruthy()
  expect(await page.locator('[data-rp-n]').innerText()).toBe(said)
}

test('the day plays as one story: nothing shifts, the axes and the frame stay, it ends on the still chart', async ({ page }) => {
  const site = await today(page)
  await open(page, site.domain, '?view=briefing&period=today')
  const before = { html: await markup(page), png: await still(page), h: await blockHeight(page) }
  const html = await page.locator('svg#chart').evaluate((s) => s.querySelector('polyline')?.getAttribute('points'))
  await watch(page)
  const t0 = Date.now()
  await idle(page).click()
  await expect(playing(page)).toBeVisible()
  expect(await blockHeight(page), 'nothing grows for the run').toBe(before.h)
  await expect(wrap(page)).toBeVisible({ timeout: 20_000 })
  const took = Date.now() - t0
  await expect(idle(page)).toBeVisible()
  expect(took).toBeGreaterThan(2000)
  expect(took).toBeLessThan(15_000)
  const r = await steady(page, ['Replay', 'Stop'])
  expect(r.clip).toBe(true)
  await exact(page)
  await expect(page.locator('.chwrap[data-reveal]')).toHaveCount(0)
  await expect(page.locator('svg#chart [clip-path]')).toHaveCount(0)
  expect(await page.locator('svg#chart').evaluate((s) => s.querySelector('polyline')?.getAttribute('points'))).toBe(html)
  expect(await blockHeight(page), 'nor for the end state').toBe(before.h)
  await same(page, before)
  await bar(page).getByRole('button', { name: 'Close' }).click()
  await expect(bar(page)).toHaveCount(0)
  expect(await blockHeight(page)).toBe(before.h)
  expect((await report(page)).cls).toBe(0)
})

test('Esc stops the run where it is, and the chart is as it was', async ({ page }) => {
  const site = await today(page)
  await open(page, site.domain, '?view=briefing&period=today')
  const before = { html: await markup(page), png: await still(page), h: await blockHeight(page) }
  await watch(page)
  await idle(page).click()
  await expect(playing(page)).toBeVisible()
  await page.waitForTimeout(700)
  await page.keyboard.press('Escape')
  await expect(idle(page)).toBeVisible()
  await expect(bar(page)).toHaveCount(0)
  await expect(page.locator('.chwrap[data-reveal]')).toHaveCount(0)
  await expect(page.locator('svg#chart [clip-path]')).toHaveCount(0)
  await steady(page, ['Replay', 'Stop'])
  expect(await blockHeight(page)).toBe(before.h)
  await same(page, before)
})

test('Skip goes straight to the end state', async ({ page }) => {
  const site = await today(page)
  await open(page, site.domain, '?view=briefing&period=today')
  const before = { html: await markup(page), png: await still(page), h: await blockHeight(page) }
  await watch(page)
  await idle(page).click()
  await expect(playing(page)).toBeVisible()
  await bar(page).getByRole('button', { name: 'Skip' }).click()
  await expect(wrap(page)).toBeVisible()
  await expect(idle(page)).toBeVisible()
  expect((await wrap(page).innerText()).includes(` ${await page.locator('.rp-gh').first().innerText()} `)).toBe(true)
  await steady(page, ['Replay', 'Stop'])
  expect(await blockHeight(page)).toBe(before.h)
  await same(page, before)
})

test('a double click does not break it: it starts, stops, and the next click plays cleanly to the end', async ({ page }) => {
  const site = await today(page)
  await open(page, site.domain, '?view=briefing&period=today')
  const before = { html: await markup(page), png: await still(page), h: await blockHeight(page) }
  await watch(page)
  await idle(page).dblclick()
  await expect(idle(page)).toBeVisible()
  await expect(page.locator('.chwrap[data-reveal]')).toHaveCount(0)
  await expect(page.locator('svg#chart [clip-path]')).toHaveCount(0)
  await same(page, before)
  await idle(page).click()
  await expect(playing(page)).toBeVisible()
  await expect(wrap(page)).toBeVisible({ timeout: 20_000 })
  await steady(page, ['Replay', 'Stop'])
  expect(await blockHeight(page)).toBe(before.h)
  await same(page, before)
})

for (const width of [1440, 390]) {
  test(`with reduced motion nothing is drawn on: the end state shows at once (${width}px)`, async ({ page }) => {
    const site = await today(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page, site.domain, '?view=briefing&period=today', width)
    const before = { html: await markup(page), png: await still(page), h: await blockHeight(page) }
    await watch(page)
    await idle(page).click()
    await expect(wrap(page)).toBeVisible()
    await page.waitForTimeout(600)
    const r = await report(page)
    expect(r.clip).toBe(false)
    expect(r.cls).toBe(0)
    expect(r.names).toEqual(['Replay'])
    expect(await blockHeight(page)).toBe(before.h)
    await same(page, before)
    await page.keyboard.press('Escape')
    await expect(bar(page)).toHaveCount(0)
    expect(await blockHeight(page)).toBe(before.h)
  })
}

for (const width of [1440, 390]) {
  test(`a longer period is told by its real moments, with nothing shifting (${width}px)`, async ({ page }) => {
    await page.route(/\/moments\?/, (r) => r.fulfill({ json: { moments: [{ t: `${new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10)}T00:00`, kind: 'spike', factor: 3.2, referrer: 'news.ycombinator.com', visitors: 120 }] } }))
    await open(page, HISTORY_DOMAIN, '?view=briefing&period=30d', width)
    await expect(page.locator('.chlay .moment-mark').first()).toBeVisible() // the chart's markers are part of the picture
    await page.waitForTimeout(600)
    const before = { html: await markup(page), png: await still(page), h: await blockHeight(page) }
    await watch(page)
    await idle(page).click()
    await expect(playing(page)).toBeVisible()
    // The moment the server named is told while the line rests on it, and the chart's own label gives way to it.
    await expect(page.locator('.rp-cap[data-s=show] .rp-bub')).toContainText('3.2×', { timeout: 15_000 })
    await expect(page.locator('.rp-stage[data-pinned]')).toHaveCount(1)
    const rise = page.locator('svg#chart [data-rise]')
    if (await rise.count()) await expect(rise).toHaveCSS('opacity', '0')
    expect(await blockHeight(page)).toBe(before.h)
    await expect(wrap(page)).toBeVisible({ timeout: 20_000 })
    await expect(idle(page)).toBeVisible()
    await steady(page, ['Replay', 'Stop'])
    await exact(page)
    await expect(page.locator('svg#chart [clip-path]')).toHaveCount(0)
    await same(page, before)
    await bar(page).getByRole('button', { name: 'Replay again' }).click()
    await expect(playing(page)).toBeVisible()
    await playing(page).click()
    await expect(bar(page)).toHaveCount(0)
    await expect(idle(page)).toBeVisible()
    expect(await blockHeight(page)).toBe(before.h)
    expect((await report(page)).cls).toBe(0)
  })
}

test('a period with no moments is one sweep of the line, and tells nothing it does not have', async ({ page }) => {
  await page.route(/\/moments\?/, (r) => r.fulfill({ json: { moments: [] } }))
  await open(page, HISTORY_DOMAIN, '?view=briefing&period=30d')
  await watch(page)
  await idle(page).click()
  await expect(wrap(page)).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.rp-cap:is(.source, .mention, .sale, .down)')).toHaveCount(0)
  await steady(page, ['Replay', 'Stop'])
})
