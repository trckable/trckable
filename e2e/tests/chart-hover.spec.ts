// The main chart plays back under the cursor: the crosshair sits at the cut
// (only Replay, a drag or a picked day grey what is right of it). Arrow keys and
// Replay move the same cut, leaving the chart restores it, a note stays
// readable in the hover card, and with reduced motion the cut never glides.
import { expect, test, type Locator, type Page } from './fixtures'
import { execFileSync } from 'node:child_process'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API, HISTORY_DOMAIN } from '../playwright.config'

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'chart hover e2e password 1'

// Signing in is rate limited per address: every browser here shares one
// session, made once by whichever worker gets there first.
async function session(): Promise<string> {
  const file = join(process.env.TRCKABLE_DATA_DIR!, 'chart-hover-session')
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const email = `chart-hover-${Date.now()}@example.com`
  for (let i = 0; ; i++) {
    try {
      execFileSync(BIN, ['admin', 'add-user', email, '--role', 'owner'], { input: PASSWORD + '\n', env: process.env, stdio: ['pipe', 'ignore', 'ignore'] })
      break
    } catch (e) {
      if (i >= 4) throw e
      await new Promise((r) => setTimeout(r, 300))
    }
  }
  const res = await fetch(API + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })
  const value = /trckable_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1]
  if (!res.ok || !value) throw new Error(`sign in: ${res.status}`)
  writeFileSync(file, value)
  return value
}

let cookie = ''
test.beforeAll(async ({ browser }) => {
  cookie = await session()
  // At least one visit today, so the chart has a line to cut.
  const ctx = await browser.newContext()
  const p = await ctx.newPage()
  await p.goto(`/r/chart-hover-${Date.now()}/index.html`)
  await p.waitForTimeout(1500)
  await ctx.close()
})

async function openChart(page: Page) {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  // The site with days of history (playwright.config.ts): several buckets at any time of day.
  await page.goto(`${API}/${HISTORY_DOMAIN}?compare=previous`)
  const chart = page.locator('.chart-wrap')
  await expect(chart.locator('svg[role="img"]')).toBeVisible({ timeout: 30_000 })
  const points = Number(/(\d+) points/.exec((await chart.locator('svg[role="img"]').getAttribute('aria-label')) ?? '')?.[1] ?? 0)
  expect(points, `the chart needs at least 3 buckets to hover between, and has ${points}: is ${HISTORY_DOMAIN} seeded?`).toBeGreaterThanOrEqual(3)
  // The page settles (a scrollbar, a banner) before anything is measured on it.
  let at = JSON.stringify(await chart.boundingBox())
  for (let same = 0, i = 0; same < 3 && i < 40; i++) {
    await page.waitForTimeout(150)
    const now = JSON.stringify(await chart.boundingBox())
    same = now === at ? same + 1 : 0
    at = now
  }
  return chart
}

const cut = (page: Page) =>
  page.locator('.chart-wrap').evaluate((el: HTMLElement) => ({
    state: el.dataset.cut,
    at: parseFloat(el.style.getPropertyValue('--cut')),
    width: el.getBoundingClientRect().width,
  }))

/** The cut once it has stopped gliding: a read mid-glide is not where it lands. */
async function still(page: Page) {
  let last = await cut(page)
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(150)
    const now = await cut(page)
    if (now.at === last.at && now.state === last.state) return now
    last = now
  }
  return last
}

/** The line's path once it has stopped moving (its opening tween, or the
 *  comparison arriving and rescaling it): unchanged for a full second. */
async function linePath(chart: Locator) {
  let last = await chart.locator('.chart-line').getAttribute('d')
  let same = 0
  for (let i = 0; i < 60 && same < 7; i++) {
    await chart.page().waitForTimeout(150)
    const now = await chart.locator('.chart-line').getAttribute('d')
    same = now === last ? same + 1 : 0
    last = now
  }
  return last!
}

test('the cut follows the pointer and leaving the chart restores it', async ({ page }) => {
  const chart = await openChart(page)
  const box = (await chart.boundingBox())!
  expect((await cut(page)).state).toBe('off')

  await page.mouse.move(box.x + box.width * 0.4, box.y + 60)
  await expect(page.locator('.time-tip')).toBeVisible()
  let c = await cut(page)
  expect(c.state).toBe('on')
  expect(c.at).toBeGreaterThan(c.width * 0.3)
  expect(c.at).toBeLessThan(c.width * 0.5)
  // The line, area, ghost and strip are one masked group: the paths do not
  // change as the cut moves, only the mask's grey rect does.
  const d = await linePath(chart)
  await page.mouse.move(box.x + box.width * 0.6, box.y + 60)
  c = await cut(page)
  expect(c.at).toBeGreaterThan(c.width * 0.5)
  await expect(chart.locator('.chart-line')).toHaveAttribute('d', d!)
  expect(await chart.locator('g[mask] .chart-line').count()).toBe(1)

  await page.mouse.move(box.x + box.width / 2, box.y - 120)
  await expect(page.locator('.time-tip')).toHaveCount(0)
  expect((await cut(page)).state).toBe('off')
})

test('arrow keys move the same cut, a bucket at a time', async ({ page }) => {
  const chart = await openChart(page)
  await chart.locator('svg[role="img"]').focus()
  await page.keyboard.press('End')
  const end = (await still(page)).at
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('.time-tip')).toBeVisible()
  const back = await still(page)
  expect(back.state).toBe('on')
  expect(back.at).toBeLessThan(end)
  await page.keyboard.press('Escape')
  expect((await cut(page)).state).toBe('off')
})

test('a note stays readable and is added from the crosshair', async ({ page }) => {
  const chart = await openChart(page)
  const box = (await chart.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.5, box.y + 80)
  // The day it goes on, as the + says it ("Add a note on Sat, Sep 26").
  const day = ((await page.locator('.note-add').getAttribute('aria-label')) ?? '').replace(/^Add a note on /, '').replace(/ · \d\d:\d\d$/, '')
  await page.locator('.note-add').click()
  const text = `Chart hover note ${Date.now()}`
  await page.getByPlaceholder(/What happened/).fill(text)
  await page.getByRole('dialog').getByRole('button', { name: 'Add note' }).click()
  // Flags sit above the chart's mask, so the greyed half never dims them.
  const flag = chart.locator('.note-mark').first()
  await expect(flag).toBeVisible()
  expect(await flag.evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
  // Back on the note's day: its flag (by the hour, a day's note sits on the
  // day's first hour).
  const at = (await chart.getByRole('button', { name: new RegExp(`notes? on ${day}$`) }).boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y - 120)
  await page.mouse.move(at.x + at.width / 2, box.y + 80)
  // Every browser adds its own note to the same day: find this one's.
  await expect(page.locator('.time-tip .tip-note', { hasText: text })).toBeVisible()
})

test('with reduced motion the cut moves without a glide', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const chart = await openChart(page)
  const box = (await chart.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.5, box.y + 60)
  // Reduced motion leaves at most the page-wide near-zero duration.
  const glide = await page.locator('.chart-dim').evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration))
  expect(glide).toBeLessThan(0.01)
  expect((await cut(page)).state).toBe('on')
})

// A short span is drawn by the hour: Replay plays that chart, hour by hour,
// and never swaps it for the span by day.
test('Replay plays the chart on screen: same start, same bucket', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const day = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10)
  await page.goto(API + `/example.com?from=${day(2)}&to=${day(0)}`)
  const svg = page.locator('.overview-chart .chart-wrap svg[role="img"]')
  await expect(svg).toBeVisible({ timeout: 15_000 })
  const before = await svg.getAttribute('aria-label')
  await page.getByRole('button', { name: 'Replay this period hour by hour' }).click()
  await expect(page.getByRole('button', { name: 'Pause replay' })).toBeVisible()
  await expect(page.locator('.overview-chart.replaying')).toBeVisible()
  await expect(svg).toHaveAttribute('aria-label', before!)
  expect(page.url()).not.toMatch(/[?&](day|bucket)=/)
  // The story: its moments' rail under the chart; Esc stops it.
  await expect(page.locator('.overview-chart .story')).toBeVisible()
  await page.getByRole('button', { name: 'Pause replay' }).click()
  await page.keyboard.press('Escape')
  await expect(page.locator('.overview-chart .story')).toHaveCount(0)
})

// While Replay plays, the chart is not hoverable: no crosshair, tooltip or dot,
// and the cut stays at the playhead. Paused, hover works again.
test('the chart ignores the pointer while Replay plays and hovers again when paused', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=data`) // days of history: a replay that lasts long enough to hover over
  const chart = page.locator('.overview-chart .chart-wrap')
  await expect(chart.locator('svg[role="img"]')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /^Replay this period/ }).click()
  await expect(chart).toHaveAttribute('data-locked', 'true')
  const box = (await chart.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2)
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2)
  await expect(chart.locator('.time-tip')).toHaveCount(0)
  await expect(chart.locator('circle[r="5"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Pause replay' }).click()
  await expect(chart).not.toHaveAttribute('data-locked', 'true')
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2)
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2)
  await expect(chart.locator('.time-tip')).toBeVisible()
})

// A vertical line has no width, so Playwright calls it hidden even when drawn:
// what is asserted is the style the browser resolves for it.
const atRest = async (chart: Locator) => {
  await expect(chart).toHaveAttribute('data-cut', 'off')
  await expect.poll(() => chart.locator('.chart-cut').evaluate((el) => getComputedStyle(el).visibility)).toBe('hidden')
  await expect.poll(() => chart.locator('.chart-dim:not(.chart-unknown)').evaluate((el) => getComputedStyle(el).opacity)).toBe('0')
  await expect(chart.locator('svg circle[r="6"]')).toHaveCount(0)
  await expect(chart.locator('.cursor')).toHaveCount(0)
}

async function openHistory(page: Page, path = `/${HISTORY_DOMAIN}?view=data`) {
  await page.addInitScript(() => localStorage.setItem('tkb_replay_speed', 'rapid'))
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  // A side card (a milestone reached) can sit over the chart's corner, and slides in late in WebKit: put it away whenever it shows up.
  await page.addLocatorHandler(page.locator('aside.side-card .side-card-x').first(), (x) => x.click())
  await page.goto(API + path)
  const chart = page.locator('.overview-chart .chart-wrap')
  await expect(chart.locator('svg[role="img"]')).toBeVisible({ timeout: 15_000 })
  for (const x of await page.locator('aside.side-card .side-card-x').all()) await x.click({ timeout: 2000 }).catch(() => {})
  return chart
}

// When Replay and its story end, the chart is at rest: no cut line, no dot
// left at the last point, nothing greyed. Hovering brings the crosshair back.
// By day (a site with days of history) and by the hour (a new site's week).
for (const [name, path] of [['daily', `/${HISTORY_DOMAIN}`], ['hourly', '/example.com?period=7d']]) {
test(`after Replay ends the ${name} chart is at rest and hovering still shows the crosshair`, async ({ page }) => {
  const chart = await openHistory(page, path)
  await page.getByRole('button', { name: /^Replay this period/ }).click()
  await expect(chart).toHaveAttribute('data-locked', 'true')
  // The story's summary card is what a finished replay leaves behind.
  await expect(page.locator('.overview-chart .story-end')).toBeVisible({ timeout: 30_000 })
  await expect(chart).not.toHaveAttribute('data-locked', 'true')
  await atRest(chart)
  const box = (await chart.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2)
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2)
  await expect(chart.locator('.time-tip')).toBeVisible()
  await expect(chart.locator('.cursor line')).toHaveCount(1)
  await expect(chart).toHaveAttribute('data-cut', 'on')
})
}

// A replay paused part of the way leaves its day picked for the numbers, so
// the chart still shows which day, quietly: a thin dashed line, a small dot,
// the far side grey. Hovering brings back the full crosshair.
test('a paused Replay leaves a quiet marker on the picked day', async ({ page }) => {
  const chart = await openHistory(page)
  await page.getByRole('button', { name: /^Replay this period/ }).click()
  await expect(chart).toHaveAttribute('data-locked', 'true')
  await page.getByRole('button', { name: 'Pause replay' }).click()
  await expect(chart).not.toHaveAttribute('data-locked', 'true')
  await expect(chart).toHaveAttribute('data-quiet', 'true')
  await expect(chart).toHaveAttribute('data-cut', 'on')
  const style = (sel: string, prop: string) => chart.locator(sel).evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop)
  await expect.poll(() => style('.chart-cut', 'stroke-dasharray')).not.toBe('none')
  expect(await style('.chart-cut', 'stroke-width')).toBe('1px')
  expect(await style('.chart-cut', 'opacity')).toBe('0.6')
  expect(await style('.chart-cut', 'visibility')).toBe('visible')
  expect(await style('.chart-dim:not(.chart-unknown)', 'opacity')).toBe('1')
  await expect(chart.locator('svg circle[r="4"]')).toHaveCount(1)
  await expect(chart.locator('svg circle[r="6"]')).toHaveCount(0)
  const box = (await chart.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2)
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2)
  await expect(chart).not.toHaveAttribute('data-quiet', 'true')
  // Hovering only moves the crosshair: nothing is greyed.
  await expect.poll(() => style('.chart-dim:not(.chart-unknown)', 'opacity')).toBe('0')
  await expect(chart.locator('.cursor line')).toHaveCount(1)
})

// The slider under the chart spans the same days the chart does, the whole
// period. A day picked on it is where the chart marks it, and the
// chip names the day the chart's own cursor names.
const PAD_L = 44 // the plot starts this far in from the chart's left edge

async function thumbAndMarker(page: Page, chart: Locator) {
  const thumb = await page.locator('#scrub').evaluate((el: HTMLInputElement) => (+el.value - +el.min) / (+el.max - +el.min))
  const b = (await chart.boundingBox())!
  const m = (await chart.locator('svg circle[r="4"]').boundingBox())!
  return { thumb, marker: (m.x + m.width / 2 - b.x - PAD_L) / (b.width - PAD_L) }
}

test('the Replay slider spans the chart, so its thumb sits at the picked day', async ({ page }) => {
  const chart = await openHistory(page)
  const points = Number(/(\d+) points/.exec((await chart.locator('svg[role="img"]').getAttribute('aria-label')) ?? '')?.[1] ?? 0)
  const slider = page.locator('#scrub')
  expect(await slider.getAttribute('min')).toBe('0')
  expect(await slider.getAttribute('max')).toBe(String(points - 1))
  await slider.fill('1')
  await expect(chart).toHaveAttribute('data-quiet', 'true')
  const chip = page.locator('.scrub-day')
  await expect(chip).toBeVisible()
  const at = await thumbAndMarker(page, chart)
  expect(Math.abs(at.thumb - at.marker)).toBeLessThan(0.04)
  // The chart's own cursor, put on that marker, names the chip's day.
  const b = (await chart.boundingBox())!
  const day = ((await chip.textContent()) ?? '').trim()
  await page.mouse.move(b.x + PAD_L + at.marker * (b.width - PAD_L), b.y + b.height / 2)
  await page.mouse.move(b.x + PAD_L + at.marker * (b.width - PAD_L) + 1, b.y + b.height / 2)
  await expect(chart.locator('.cursor-pill')).toContainText(day)
})

// In Full the chart itself picks the day (a click or drag on it): the thumb follows.
test('picking a day on the chart moves the Replay slider to it', async ({ page }) => {
  const chart = await openHistory(page, `/${HISTORY_DOMAIN}?mode=full`)
  const b = (await chart.boundingBox())!
  await page.mouse.move(b.x + PAD_L + 0.8 * (b.width - PAD_L), b.y + b.height / 2)
  await page.mouse.down()
  await page.mouse.up()
  await expect(page.locator('.scrub-day')).toBeVisible()
  await page.mouse.move(5, 5)
  await expect(chart).toHaveAttribute('data-quiet', 'true')
  const at = await thumbAndMarker(page, chart)
  expect(at.thumb).toBeGreaterThan(0.6)
  expect(Math.abs(at.thumb - at.marker)).toBeLessThan(0.04)
})
