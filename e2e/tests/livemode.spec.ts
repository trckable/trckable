// Live: the site right now, in the walkthrough's layout. A visit from another browser slides into "On the site right
// now" and moves the numbers, without a reload; the switch and the L and B keys lead between Live and the Briefing;
// a phone gets the panels stacked; a site with no visit yet shows its install screen.
import { expect, test, type Page } from './fixtures'
import { execFileSync } from 'node:child_process'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API } from '../playwright.config'

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'live mode e2e password 1'

// Signing in is limited to ten tries in ten minutes from one address, and the
// other suites need theirs: every browser here shares one session, made once
// by whichever worker gets there first.
async function session(): Promise<string> {
  const file = join(process.env.TRCKABLE_DATA_DIR!, 'livemode-session')
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const email = `livemode-${Date.now()}@example.com`
  // Other suites add their people at the same moment: a busy database is
  // tried again.
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
test.beforeAll(async () => {
  cookie = await session()
})

// The suite's page sends a dashboard address to the older Data (?v=explore) unless the address has a v of its own: an
// empty one says "no view", which is the walkthrough's.
const mine = (path: string) => path + (path.includes('?') ? '&v=' : '?v=')

async function signIn(page: Page, path = '/example.com') {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(API + (path.includes('v=') ? path : mine(path)))
}

/** A new visitor on the test site, from a browser context of its own. */
async function visit(page: Page, name: string) {
  const ctx = await page.context().browser()!.newContext()
  const p = await ctx.newPage()
  const run = `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  await p.goto(`/r/${run}/index.html`)
  await p.waitForTimeout(1500) // the pageview leaves
  await ctx.close()
  return run
}

const num = async (page: Page, sel: string) => Number((await page.locator(sel).first().innerText()).replace(/[^\d]/g, '') || 0)

const live = (page: Page) => page.getByRole('region', { name: 'Live', exact: true })
const online = (page: Page) => page.locator('.lnow .lfig .lbign').first()
const visitors = (page: Page) => page.locator('.lnow .lfig .lbign').nth(1)
const tabs = (page: Page) => page.getByRole('tablist', { name: 'View' })

test('a visit slides in and the numbers move, without a reload', async ({ page }) => {
  await signIn(page, '/example.com?view=live')
  await expect(online(page)).toBeVisible({ timeout: 15_000 })
  // Live is always now: no period, and no reload bar over it.
  await expect(page.locator('.pwrap')).toHaveCount(0)
  await expect(page.locator('.loadbar')).toHaveCount(0)
  // One screen: the two panels fit it; the cards, when there are any, come below.
  expect(await page.locator('.lnow').evaluate((el) => el.getBoundingClientRect().bottom - innerHeight)).toBeLessThanOrEqual(0)
  let reloads = 0
  page.on('framenavigated', (f) => f === page.mainFrame() && reloads++)
  const before = { online: await num(page, '.lnow .lfig .lbign'), visitors: await visitors(page).innerText() }
  const run = await visit(page, 'livemode')
  // The path is cut in the middle on screen; its full text is the title.
  const row = page.locator('.lfeed .lv', { has: page.locator(`.pg[title*="${run}"]`) })
  await expect(row).toBeVisible({ timeout: 5_000 })
  // Near the top: newest first (other browsers' tests may visit at the same time).
  expect(await row.evaluate((el) => [...el.parentElement!.children].indexOf(el))).toBeLessThan(4)
  await expect.poll(() => num(page, '.lnow .lfig .lbign'), { timeout: 5_000 }).toBeGreaterThan(before.online)
  await expect.poll(() => visitors(page).innerText(), { timeout: 5_000 }).not.toBe(before.visitors)
  // The strip counted it: its label carries the 30 minutes' total.
  await expect(page.locator('.lnow .mins')).not.toHaveAttribute('aria-label', /: 0 in all/)
  expect(reloads).toBe(0)
})

for (const [name, width, height] of [['desktop', 1440, 900], ['phone', 390, 844]] as const) {
  test(`${name}: people on the site now is the big number first, the last 30 minutes the smaller one after it`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await signIn(page, '/example.com?view=live')
    await expect(online(page)).toBeVisible({ timeout: 15_000 })
    const pair = page.locator('.lnow .lfig > div')
    await expect(pair.nth(0).locator('.ll')).toHaveText('On the site now')
    await expect(pair.nth(1).locator('.ll')).toHaveText('Came in the last 30 min')
    const a = (await pair.nth(0).boundingBox())!
    const b = (await pair.nth(1).boundingBox())!
    // Side by side the first is on the left; stacked it is on top.
    expect(a.x < b.x || a.y < b.y).toBe(true)
    const size = (i: number) => pair.nth(i).locator('.lbign').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
    expect(await size(0)).toBeGreaterThan(await size(1))
  })
}

test('a new visitor animates in and the headline numbers do not move, and the numbers never go blank or NaN', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => {
    const w = window as unknown as { __shifts: { value: number; outside: boolean }[]; __bad: string[] }
    w.__shifts = []
    w.__bad = []
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean; sources: { node: Node | null }[] }[]) {
        if (e.hadRecentInput) continue
        // Data (a bar's height, a country row) may move what is under it; the headline numbers and their labels may not.
        const outside = e.sources.some((s) => !!s.node && !!(s.node.parentElement ?? (s.node as Element)).closest('.lfig'))
        w.__shifts.push({ value: e.value, outside })
      }
    }).observe({ type: 'layout-shift', buffered: true })
    const look = () => {
      for (const el of document.querySelectorAll('.lnow .lfig .rn')) {
        const t = el.querySelector('.rn-text')?.textContent ?? ''
        const d = el.querySelector('.rn-digits')?.textContent ?? ''
        if (!/^\d[\d,.\s]*$/.test(t) || !/\d/.test(d) || /NaN/.test(t + d)) w.__bad.push(`${t}|${d}`)
      }
      requestAnimationFrame(look)
    }
    requestAnimationFrame(look)
  })
  await signIn(page, '/example.com?view=live')
  await expect(online(page)).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.lfeed .lv').first()).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(1500)
  const start = await page.evaluate(() => (window as unknown as { __shifts: unknown[] }).__shifts.length)
  const before = await num(page, '.lnow .lfig .lbign')
  const run = await visit(page, 'livemotion')
  const row = page.locator('.lfeed .lv', { has: page.locator(`.pg[title*="${run}"]`) })
  await expect(row).toHaveClass(/arriving/, { timeout: 5_000 })
  await expect.poll(() => num(page, '.lnow .lfig .lbign'), { timeout: 5_000 }).toBeGreaterThan(before)
  await page.waitForTimeout(1200)
  const seen = await page.evaluate(() => {
    const w = window as unknown as { __shifts: { value: number; outside: boolean }[]; __bad: string[] }
    return { shifts: w.__shifts, bad: w.__bad }
  })
  // The new row pushes the rows under it down inside the list; the two headline numbers and their labels stay where they are.
  expect(seen.shifts.slice(start).filter((s) => s.outside)).toEqual([])
  expect(seen.bad).toEqual([])
})

test('a visit that arrives later is marked as arriving, then settles; the first look is not', async ({ page }) => {
  await signIn(page, '/example.com?view=live')
  await expect(online(page)).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.lfeed .lv').first()).toBeVisible({ timeout: 15_000 })
  // Whoever was there at the first look came in without a mark.
  await expect(page.locator('.lfeed .lv.arriving')).toHaveCount(0)
  const run = await visit(page, 'livearrive')
  const row = page.locator('.lfeed .lv', { has: page.locator(`.pg[title*="${run}"]`) })
  await expect(row).toHaveClass(/arriving/, { timeout: 5_000 })
  await expect(row).not.toHaveClass(/arriving/, { timeout: 6_000 })
})

test('the chart switch keeps bars or line across a reload and both draw the same minutes', async ({ page }) => {
  await signIn(page, '/example.com?view=live')
  await expect(online(page)).toBeVisible({ timeout: 15_000 })
  const style = page.getByRole('group', { name: 'Chart style' })
  await expect(style.getByRole('button', { name: 'Bars' })).toHaveAttribute('aria-pressed', 'true')
  await style.getByRole('button', { name: 'Line' }).click()
  await page.reload()
  await expect(online(page)).toBeVisible({ timeout: 15_000 })
  await expect(style.getByRole('button', { name: 'Line' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.lchart')).toHaveAttribute('data-mode', 'line')
  const read = (sel: string) =>
    page.locator(sel).evaluate((el) => ({ label: el.getAttribute('aria-label'), titles: [...el.querySelectorAll('i[title]')].map((i) => i.getAttribute('title')) }))
  const bars = await read('.lnow .mins')
  const line = await read('.lnow .mline')
  expect(line.label).toBe(bars.label)
  expect(line.titles.length).toBe(30)
  expect(line.titles).toEqual(bars.titles)
  await expect(page.locator('.lnow .mline-dot')).toBeVisible()
  await style.getByRole('button', { name: 'Bars' }).click()
  await expect(page.locator('.lchart')).toHaveAttribute('data-mode', 'bars')
})

test('the sample revenue card on Live is never clipped: Connect sits fully inside the card', async ({ page }) => {
  // Other specs may have connected payments on this site: the sample card is what a site without sales shows.
  await page.route('**/api/v1/sites/*/now*', async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    delete body.revenue
    await route.fulfill({ response: res, json: body })
  })
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await signIn(page, '/example.com?view=live')
    await expect(online(page)).toBeVisible({ timeout: 15_000 })
    const connect = page.locator('.lnow .lrev').getByRole('button', { name: 'Connect' })
    await expect(connect).toBeVisible()
    const [b, card] = await Promise.all([connect.boundingBox(), page.locator('.lnow').boundingBox()])
    expect(b && card && b.x >= card.x && b.x + b.width <= card.x + card.width + 0.5, `Connect inside the card at ${width}`).toBe(true)
    const lock = await page.locator('.lnow .lrev').boundingBox()
    expect(lock && b && b.x + b.width <= lock.x + lock.width + 0.5, `Connect inside its own block at ${width}`).toBe(true)
  }
})

// The left Live card is as tall as what is in it: no band of nothing, whatever the card's width or how quiet the site is,
// and no section title that wraps.
test('the Live card has no empty band and no wrapped titles, wide and narrow', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  for (const width of [900, 420]) {
    await signIn(page, '/example.com?view=live')
    await expect(online(page)).toBeVisible({ timeout: 15_000 })
    await page.evaluate((w) => ((document.querySelector('.liveview') as HTMLElement).style.gridTemplateColumns = `${w}px 1fr`), width)
    await page.waitForTimeout(300)
    const r = await page.locator('.lnow').evaluate((card) => {
      const box = card.getBoundingClientRect()
      const chart = card.querySelector('.lchart')!
      const parts = [...card.querySelectorAll('*')].filter((el) => (!el.children.length || el === chart) && !chart.contains(el) || el === chart)
      const rects = parts.map((el) => el.getBoundingClientRect()).filter((b) => b.width > 0 && b.height > 0).sort((a, b) => a.top - b.top)
      let reach = box.top
      let gap = 0
      for (const b of rects) {
        gap = Math.max(gap, b.top - reach)
        reach = Math.max(reach, b.bottom)
      }
      gap = Math.max(gap, box.bottom - reach)
      const titles = [...card.querySelectorAll('.ll')].map((el) => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight || '16'))
      return { gap, width: box.width, titles }
    })
    expect(r.width).toBeLessThanOrEqual(width + 1)
    expect(r.gap, `empty band at ${width}`).toBeLessThanOrEqual(48)
    for (const t of r.titles) expect(t, `a title wraps at ${width}`).toBeLessThan(1.6)
  }
})

test('the two top Live cards are the same height side by side', async ({ page }) => {
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 900 })
    await signIn(page, '/example.com?view=live')
    await expect(online(page)).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(300)
    const [a, b] = await Promise.all([page.locator('.lnow').boundingBox(), page.locator('.lon').boundingBox()])
    expect(a && b && Math.abs(a.height - b.height) <= 1, `heights ${a?.height} and ${b?.height} at ${width}`).toBe(true)
  }
})

test('a long list scrolls inside its card with a fade and the cards keep one height', async ({ page }) => {
  await page.route('**/api/v1/sites/*/now*', async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    const r0 = body.recent[0] ?? { kind: 'pageview', path: '/', channel: 'Direct', country: 'DE', device: 'Desktop', ts: body.at, last: body.at }
    body.recent = Array.from({ length: 19 }, (_, i) => ({ ...r0, visitor: `x${i}`, ts: r0.ts - i * 1000, last: r0.last - i * 1000 }))
    body.online = Math.max(body.online, 19)
    await route.fulfill({ response: res, json: body })
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await signIn(page, '/example.com?view=live')
  await expect(online(page)).toBeVisible({ timeout: 15_000 })
  const heights = async () => Promise.all([page.locator('.lnow').boundingBox(), page.locator('.lon').boundingBox()])
  const equal = async () => {
    const [a, b] = await heights()
    return !!a && !!b && Math.abs(a.height - b.height) <= 1
  }
  expect(await equal()).toBe(true)
  expect(await equal()).toBe(true)
  const feed = page.locator('.lon .lfeed')
  expect(await feed.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
  await expect(feed).toHaveAttribute('data-below', 'true')
  await feed.evaluate((el) => (el.scrollTop = el.scrollHeight))
  await expect(feed).not.toHaveAttribute('data-below', 'true')
  expect(await equal()).toBe(true)
  await expect(page.locator('.lfeed .lv')).toHaveCount(19)
})

test('scrolling the people list leaves its head where it is, and the page does not scroll', async ({ page }) => {
  await page.route('**/api/v1/sites/*/now*', async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    const r0 = body.recent[0] ?? { kind: 'pageview', path: '/', channel: 'Direct', country: 'DE', device: 'Desktop', ts: body.at, last: body.at }
    body.recent = Array.from({ length: 19 }, (_, i) => ({ ...r0, visitor: `x${i}`, ts: r0.ts - i * 1000, last: r0.last - i * 1000 }))
    body.online = Math.max(body.online, 19)
    await route.fulfill({ response: res, json: body })
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await signIn(page, '/example.com?view=live')
  await expect(online(page)).toBeVisible({ timeout: 15_000 })
  const box = async (sel: string) => (await page.locator(sel).boundingBox())!
  const before = { head: await box('.lon .lhead'), card: await box('.lon') }
  const feed = page.locator('.lon .lfeed')
  await feed.evaluate((el) => (el.scrollTop = el.scrollHeight))
  await expect(feed).toHaveAttribute('data-above', 'true')
  await page.mouse.wheel(0, 400)
  await page.waitForTimeout(200)
  expect(await box('.lon .lhead')).toEqual(before.head)
  expect(await box('.lon')).toEqual(before.card)
  expect(await page.evaluate(() => scrollY)).toBe(0)
})

test('online is never more than the visitors of the half hour', async ({ page }) => {
  await signIn(page, '/example.com?view=live')
  await expect(online(page)).toBeVisible({ timeout: 15_000 })
  for (let i = 0; i < 4; i++) {
    expect(await num(page, '.lnow .lfig .lbign')).toBeLessThanOrEqual(await num(page, '.lnow .lfig > div:nth-child(2) .lbign'))
    await page.waitForTimeout(500)
  }
})

test('the switch has the one dot, and it dims while the connection is down', async ({ page }) => {
  await signIn(page, '/example.com?view=live')
  await expect(online(page)).toBeVisible({ timeout: 15_000 })
  const dot = tabs(page).locator('.mk-dot')
  await expect(dot).toHaveCount(1)
  // The stream refused: the card's own dot goes grey.
  await page.route('**/api/v1/sites/*/live', (route) => route.abort())
  await page.reload()
  await expect(page.locator('.lnow .lhead .mk-pulse.off')).toBeVisible({ timeout: 15_000 })
})

test('L and B and the switch lead between Live and the Briefing', async ({ page }) => {
  await signIn(page, '/example.com?view=briefing')
  await expect(page.locator('.hero')).toBeVisible({ timeout: 15_000 })
  await tabs(page).getByRole('tab', { name: /^Live/ }).click()
  await expect(page).toHaveURL(/[?&]view=live/)
  await expect(live(page)).toBeVisible()
  await page.keyboard.press('b')
  await expect(page).toHaveURL(/[?&]view=briefing/)
  await expect(page.locator('.hero')).toBeVisible()
  await page.keyboard.press('l')
  await expect(page).toHaveURL(/[?&]view=live/)
  await tabs(page).getByRole('tab', { name: 'Briefing' }).click()
  await expect(tabs(page).getByRole('tab', { name: 'Briefing' })).toHaveAttribute('aria-selected', 'true')
})

test('on a phone the panels stack and nothing runs off the side', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await signIn(page, '/example.com?view=live')
  await expect(online(page)).toBeVisible({ timeout: 15_000 })
  const now = await page.locator('.lnow').boundingBox()
  const onSite = await page.locator('.lon').boundingBox()
  expect(now && onSite && onSite.y >= now.y + now.height - 1).toBe(true)
  expect(now!.width).toBeLessThanOrEqual(375)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  // The bar at the bottom names the three places, and Live is the one on.
  await expect(page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Live' })).toHaveAttribute('aria-current', 'page')
})

// Firefox lays a button's text out a hair (under a pixel) differently from one frame to the next: "does not move"
// means by less than a pixel.
type Box = { x: number; y: number; width: number; height: number } | null
async function expectSamePlace(read: () => Promise<Box>, was: Box) {
  expect(was).toBeTruthy()
  // The switch's width follows the digits of the count of people online: where it sits and how tall it is must not move.
  // The header slides back in as the page returns to the top, so the place is read until it settles.
  for (const k of ['x', 'y', 'height'] as const) await expect.poll(async () => Math.abs(((await read())?.[k] ?? 1e9) - was![k])).toBeLessThan(1)
}

test('switching both ways: the header does not move and Live opens at the top', async ({ page }) => {
  await visit(page, 'switch') // a site with data shows its Briefing
  await signIn(page, '/example.com?view=briefing')
  await expect(page.locator('.hero')).toBeVisible({ timeout: 15_000 })
  const top = await tabs(page).boundingBox()
  await page.evaluate(() => window.scrollTo(0, Math.min(150, document.documentElement.scrollHeight - innerHeight - 40)))
  // Scrolled down, the switch is out of sight: L is the way to Live.
  await page.keyboard.press('l')
  await expect(live(page)).toBeVisible({ timeout: 15_000 })
  await expect(page).toHaveURL(/[?&]view=live/)
  expect(await page.evaluate(() => scrollY)).toBe(0)
  await expectSamePlace(() => tabs(page).boundingBox(), top)
  await tabs(page).getByRole('tab', { name: 'Briefing' }).click()
  await expect(page.locator('.hero')).toBeVisible()
  await expectSamePlace(() => tabs(page).boundingBox(), top)
})

test('reduced motion: the pill jumps rather than slides', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await signIn(page, '/example.com?view=briefing')
  await tabs(page).getByRole('tab', { name: /^Live/ }).click()
  await expect(live(page)).toBeVisible({ timeout: 15_000 })
  expect(await tabs(page).locator('.spill').evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration))).toBeLessThan(0.01)
})


// Live is what a dashboard with visitors opens in: the address says nothing of the view. A period, filters or
// ?view=briefing say the Briefing; ?view=data is the older Data, still there for addresses made before.
test('a site with visits opens in Live when the address has no mode', async ({ page }) => {
  await visit(page, 'default')
  await signIn(page, '/example.com?v=')
  await expect(online(page)).toBeVisible({ timeout: 15_000 })
  await expect(tabs(page).getByRole('tab', { name: /^Live/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page).not.toHaveURL(/view=/)
  await expect(page.locator('.pwrap')).toHaveCount(0)

  // The Briefing, chosen: the address keeps it through a reload.
  await tabs(page).getByRole('tab', { name: 'Briefing' }).click()
  await expect(page.locator('.pwrap')).toBeVisible()
  await expect(page).toHaveURL(/[?&]view=briefing/)
  await page.reload()
  await expect(page.locator('.hero')).toBeVisible({ timeout: 15_000 })
  await expect(live(page)).toHaveCount(0)

  // Addresses made before Live was the default are the Briefing now.
  for (const q of ['?period=7d', '?f=channel:Direct']) {
    await page.goto(`${API}/example.com${q}&v=`)
    await expect(page.locator('.hero')).toBeVisible({ timeout: 15_000 })
    await expect(live(page)).toHaveCount(0)
  }
  // ?view=live still says Live.
  await page.goto(`${API}/example.com?view=live`)
  await expect(online(page)).toBeVisible({ timeout: 15_000 })
})
