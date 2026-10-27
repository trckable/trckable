// Live's globe: a switch in Live's header (off, the overview, by default; the choice is kept in this browser), its own
// lazy chunk, a canvas that draws and spins, full screen that falls back to a cover, and a frame rate that holds.
import { expect, test, type Page } from './fixtures'
import { execFileSync } from 'node:child_process'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API } from '../playwright.config'

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'live globe e2e password 1'

async function session(): Promise<string> {
  const file = join(process.env.TRCKABLE_DATA_DIR!, 'liveglobe-session')
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const email = `liveglobe-${Date.now()}@example.com`
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

async function open(page: Page) {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(API + '/example.com?view=live&v=')
  await expect(page.locator('.lnow, .gwrap').first()).toBeVisible({ timeout: 15_000 })
}

const globeSwitch = (page: Page) => page.getByRole('switch', { name: 'Show the globe' })

test('the globe is off by default, switches on and off, and remembers the choice', async ({ page }) => {
  await open(page)
  await expect(globeSwitch(page)).toHaveAttribute('aria-checked', 'false')
  await expect(page.locator('.lnow')).toBeVisible()
  await expect(page.locator('.gstage')).toHaveCount(0)
  await globeSwitch(page).click()
  await expect(page.locator('.gstage canvas')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.lnow')).toHaveCount(0)
  // The globe and its list are the whole page: the cards row is gone, and it comes back with the overview.
  await expect(page.locator('.lcards')).toHaveCount(0)
  await page.reload()
  await expect(globeSwitch(page)).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('.gstage canvas')).toBeVisible({ timeout: 10_000 })
  await globeSwitch(page).click()
  await expect(page.locator('.lnow')).toBeVisible()
  await expect(page.locator('.lcards')).toHaveCount(1)
  expect(await page.evaluate(() => localStorage.getItem('trckable.live.globe'))).toBe('off')
})

test('the globe chunk loads only when the switch goes on', async ({ page }) => {
  const chunks: string[] = []
  page.on('request', (r) => /GlobePanel-/.test(r.url()) && chunks.push(r.url()))
  await open(page)
  await page.waitForTimeout(1500)
  expect(chunks).toHaveLength(0)
  await globeSwitch(page).click()
  await expect(page.locator('.gstage canvas')).toBeVisible({ timeout: 10_000 })
  expect(chunks.length).toBeGreaterThan(0)
})

test('the globe draws, spins by itself, holds still with reduced motion, and a frame costs under 4 ms', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('trckable.live.globe', 'on'))
  await open(page)
  const canvas = page.locator('.gstage canvas')
  await expect(canvas).toBeVisible({ timeout: 10_000 })
  // The suite reads pages at rest (data-motion=off); this test watches the motion itself.
  await page.evaluate(() => delete document.documentElement.dataset.motion)
  await page.setViewportSize({ width: 1281, height: 800 }) // wakes the loop, which had stopped at rest
  const lon = () => canvas.evaluate((c) => (c as unknown as { __globe: { lon: number } }).__globe.lon)
  const a = await lon()
  await page.waitForTimeout(4500) // the first spin starts after a short rest
  expect(Math.abs((await lon()) - a)).toBeGreaterThan(0.2)
  // Something was drawn: land dots are not transparent.
  expect(await canvas.evaluate((c: HTMLCanvasElement) => c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v > 0))).toBe(true)
  const sample = await page.evaluate(
    () =>
      new Promise<{ fps: number; ms: number }>((res) => {
        const g = (document.querySelector('.gstage canvas') as unknown as { __globe: { stats: { frames: number; ms: number } } }).__globe
        g.stats.frames = 0
        g.stats.ms = 0
        let n = 0
        const t0 = performance.now()
        const f = (t: number) => {
          n++
          if (t - t0 < 3000) requestAnimationFrame(f)
          else res({ fps: (n / (t - t0)) * 1000, ms: g.stats.ms / Math.max(1, g.stats.frames) })
        }
        requestAnimationFrame(f)
      }),
  )
  // Local runs go through the machine's low-power queue, so the rate is held to a floor; the frame's own cost is the real budget.
  if (test.info().project.name === 'chromium') expect(sample.fps).toBeGreaterThan(15) // Firefox here draws in software, far slower than a real screen
  expect(sample.ms).toBeLessThan(test.info().project.name === 'chromium' ? 4 : 12) // a frame's own work, in milliseconds (Firefox draws on the CPU here)
  // A crowd: 300 visitors, one pin each, spinning: a frame still stays inside its budget.
  await page.evaluate(() => {
    const g = (document.querySelector('.gstage canvas') as unknown as { __globe: { setPins: (p: unknown[]) => void } }).__globe
    const ccs = ['DE', 'US', 'GB', 'IN', 'FR', 'BR', 'JP', 'AU']
    g.setPins(Array.from({ length: 300 }, (_, i) => ({ key: `k${i}`, cc: ccs[i % 8], city: '', path: '/', lat: ((i * 37) % 100) - 40, lon: ((i * 73) % 340) - 170, last: 0, sig: `k${i}` })))
  })
  const crowd = await page.evaluate(
    () =>
      new Promise<number>((res) => {
        const g = (document.querySelector('.gstage canvas') as unknown as { __globe: { stats: { frames: number; ms: number } } }).__globe
        g.stats.frames = 0
        g.stats.ms = 0
        setTimeout(() => res(g.stats.ms / Math.max(1, g.stats.frames)), 3000)
      }),
  )
  expect(crowd).toBeLessThan(test.info().project.name === 'chromium' ? 4 : 12)
  await page.evaluate(() => (document.documentElement.dataset.motion = 'off'))
  const b = await lon()
  await page.waitForTimeout(2000)
  expect(await lon()).toBe(b)
})

test('full screen goes on and off, with a cover where the browser has none', async ({ page }) => {
  await page.addInitScript(() => {
    // A frame where the browser says yes and does nothing.
    Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true })
    HTMLElement.prototype.requestFullscreen = () => Promise.resolve()
    localStorage.setItem('trckable.live.globe', 'on')
  })
  await open(page)
  const wrap = page.locator('.gwrap')
  await page.getByRole('button', { name: 'Full screen' }).click()
  await expect(wrap).toHaveClass(/fill/)
  // Full screen is the globe alone: no head, no list, one close button, and the new visitors card.
  await expect(page.locator('.gside')).toBeHidden()
  await expect(page.locator('.gcard .lhead')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Leave full screen' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(wrap).not.toHaveClass(/fill/)
})

test('a phone stacks the globe above the list; a laptop puts them side by side', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('trckable.live.globe', 'on'))
  for (const [w, h, side] of [[390, 844, false], [1440, 900, true]] as const) {
    await page.setViewportSize({ width: w, height: h })
    await open(page)
    await expect(page.locator('.gside .gfeed')).toBeVisible({ timeout: 10_000 }) // the placeholder has no list yet
    const a = (await page.locator('.gcard').boundingBox())!
    const b = (await page.locator('.gside').boundingBox())!
    expect(b.x > a.x + a.width - 2).toBe(side)
    expect(b.y >= a.y + a.height - 2 || side).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})

test('zoom: the buttons and Ctrl + wheel, the spin waits while zoomed in and comes back, and a crowd at 6x stays in budget', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('trckable.live.globe', 'on'))
  await open(page)
  const canvas = page.locator('.gstage canvas')
  await expect(canvas).toBeVisible({ timeout: 10_000 })
  await page.evaluate(() => delete document.documentElement.dataset.motion)
  await page.setViewportSize({ width: 1281, height: 800 }) // wakes the loop, which had stopped at rest
  type G = { __globe: { zoomT: number; zoom: number; lon: number; setPins: (p: unknown[]) => void; zoomTo: (z: number) => void; stats: { frames: number; ms: number } } }
  const get = <T,>(f: (g: G['__globe']) => T) => canvas.evaluate((c, src) => new Function('g', `return (${src})(g)`)((c as unknown as G).__globe), f.toString()) as Promise<T>
  expect(await get((g) => g.zoomT)).toBe(1)
  await page.getByRole('button', { name: 'Zoom in' }).click()
  expect(await get((g) => g.zoomT)).toBeCloseTo(1.6)
  await canvas.hover()
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -500)
  await page.keyboard.up('Control')
  await expect.poll(() => get((g) => g.zoomT)).toBeGreaterThan(1.6)
  // Zoomed in, the globe does not spin.
  await page.waitForTimeout(2500) // the move to the cursor settles
  const a = await get((g) => g.lon)
  await page.waitForTimeout(2500)
  expect(Math.abs((await get((g) => g.lon)) - a)).toBeLessThan(0.05)
  // Back at 1x it spins again.
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Zoom out' }).click()
  await expect.poll(() => get((g) => g.zoom)).toBeLessThan(1.02)
  const b = await get((g) => g.lon)
  await page.waitForTimeout(5000)
  expect(Math.abs((await get((g) => g.lon)) - b)).toBeGreaterThan(0.2)
  // 300 visitors at the closest zoom.
  await page.evaluate(() => {
    const g = (document.querySelector('.gstage canvas') as unknown as G).__globe
    const ccs = ['DE', 'US', 'GB', 'IN', 'FR', 'BR', 'JP', 'AU']
    g.setPins(Array.from({ length: 300 }, (_, i) => ({ key: `k${i}`, cc: ccs[i % 8], city: 'X', path: '/', lat: ((i * 37) % 100) - 40, lon: ((i * 73) % 340) - 170, last: 0, sig: `k${i}`, ux: Math.sin(i), uy: Math.cos(i), crowd: 300 })))
    g.zoomTo(6)
  })
  await page.waitForTimeout(1500)
  const ms = await page.evaluate(
    () =>
      new Promise<number>((res) => {
        const g = (document.querySelector('.gstage canvas') as unknown as G).__globe
        g.stats.frames = 0
        g.stats.ms = 0
        setTimeout(() => res(g.stats.ms / Math.max(1, g.stats.frames)), 3000)
      }),
  )
  expect(ms).toBeLessThan(test.info().project.name === 'chromium' ? 4 : 12)
})

test('the list head shows the online count the pill shows, with the half hour as a line; full screen floats the same block', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('trckable.live.globe', 'on'))
  await open(page)
  await expect(page.locator('.gside .gbig')).toBeVisible({ timeout: 10_000 })
  const num = (t: string) => Number(t.replace(/[^\d]/g, '') || 0)
  const big = num((await page.locator('.gside .gbig .rn-text').textContent()) ?? '')
  const pill = num(await page.locator('.gcard .lm').innerText())
  expect(big).toBe(pill)
  await expect(page.locator('.gside .gspark svg')).toBeVisible()
  expect((await page.locator('.gside .gspark').boundingBox())!.height).toBeCloseTo(56, 0)
  await page.getByRole('button', { name: 'Full screen' }).click()
  await expect(page.locator('.gfloat .gbig')).toBeVisible()
  const f = (await page.locator('.gfloat').boundingBox())!
  const x = (await page.locator('.gclose').boundingBox())!
  expect(f.x + f.width).toBeLessThan(x.x) // clear of the close button
})

// The earth is real land with borders and a lit sea in space, and everyone at one spot, or close to it, is one marker with their number.
const SHOTS = '/private/tmp/claude-501/-Users-albi-Projects-trckable/ca6f67f6-3760-464f-975f-418264032c74/scratchpad'
type Inside = { states: { head: unknown; total: number; x: number; y: number; r: number }[]; det: unknown; zoom: number; zoomT: number; fineNow: boolean; zoomTo: (z: number) => void; focus: (lat: number, lon: number) => void }

async function crowd(page: Page, width: number, colorScheme: 'dark' | 'light') {
  await page.emulateMedia({ colorScheme })
  await page.setViewportSize({ width, height: width < 600 ? 900 : 800 })
  await page.addInitScript(() => localStorage.setItem('trckable.live.globe', 'on'))
  await page.route(/\/sites\/[^/]+\/now(\?|$)/, async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    const at = Date.now()
    const people = [['DE', 'Berlin'], ['DE', 'Munich'], ['JP', 'Tokyo'], ['BR', 'Sao Paulo'], ['ZA', 'Cape Town'], ...Array.from({ length: 5 }, () => ['US', 'Chicago']), ...Array.from({ length: 30 }, () => ['AL', 'Tirana']), ...Array.from({ length: 6 }, () => ['XK', 'Pristina']), ['AL', '']]
    body.online = people.length
    body.recent = people.map(([country, city], i) => ({ kind: 'pageview', ts: at - i * 2000, last: at - i * 2000, path: i === 0 ? '/form_submit' : `/p${i}`, visitor: `visitor-${i}`, country, city }))
    await route.fulfill({ response: res, json: body })
  })
  await open(page)
  const canvas = page.locator('.gstage canvas')
  await expect(canvas).toBeVisible({ timeout: 10_000 })
  await page.evaluate(() => delete document.documentElement.dataset.motion)
  await page.waitForTimeout(1500)
  return canvas
}

const heads = (canvas: ReturnType<Page['locator']>) =>
  canvas.evaluate((c) => {
    const g = (c as unknown as { __globe: Inside }).__globe
    return g.states.filter((s) => s.head === s).map((s) => ({ n: s.total, x: s.x, y: s.y, r: s.r }))
  })

for (const [width, colorScheme] of [[1280, 'dark'], [1280, 'light'], [390, 'dark']] as const) {
  test(`the globe draws land and merges a crowd into one marker, ${width}px ${colorScheme}`, async ({ page }) => {
    const canvas = await crowd(page, width, colorScheme)
    // One marker for the 30 in Tirana and the places by it (a blank dot and Pristina), not a pile of dots: the hover tells it in words.
    const marker = await heads(canvas)
    expect(marker.filter((m) => m.n >= 37)).toHaveLength(1)
    expect(marker.reduce((n, m) => n + m.n, 0)).toBe(47)
    expect(marker.length).toBeLessThanOrEqual(10)
    // No two markers sit on each other.
    const shown = marker.filter((m) => m.r > 0)
    for (const a of shown) for (const b of shown) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(14)
    const big = marker.find((m) => m.n >= 37)!
    const box = (await canvas.boundingBox())!
    await page.mouse.move(box.x + big.x, box.y + big.y)
    await expect(page.locator('.gtip')).toContainText(`${big.n} online`, { timeout: 5000 })
    await page.mouse.move(box.x + 2, box.y + 2)
    await page.screenshot({ path: `${SHOTS}/globe2-${width}-${colorScheme}.png` })
  })
}

test('zooming in fetches the detail chunk once, swaps to the finer land and writes names; markers split apart', async ({ page }) => {
  const chunks: string[] = []
  page.on('request', (r) => /\/labels-/.test(r.url()) && chunks.push(r.url()))
  const canvas = await crowd(page, 1280, 'dark')
  await page.waitForTimeout(500)
  expect(chunks).toHaveLength(0)
  const inside = <T,>(f: (g: Inside) => T, src = f.toString()) => canvas.evaluate((c, code) => new Function('g', `return (${code})(g)`)((c as unknown as { __globe: Inside }).__globe), src) as Promise<T>
  const before = (await heads(canvas)).length
  await canvas.evaluate((c) => {
    const g = (c as unknown as { __globe: Inside }).__globe
    g.focus(46, 14)
    g.zoomTo(3)
  })
  await expect.poll(() => inside((g) => !!g.det), { timeout: 15_000 }).toBe(true)
  await page.waitForTimeout(2500)
  expect(chunks.length).toBe(1)
  expect(await inside((g) => g.fineNow)).toBe(true)
  expect((await heads(canvas)).length).toBeGreaterThan(before) // zoomed in, the gathered places split
  await page.screenshot({ path: `${SHOTS}/globe2-1280-dark-zoom3.png` })
  // The detail stays: zooming out and in again fetches nothing more.
  await canvas.evaluate((c) => (c as unknown as { __globe: Inside }).__globe.zoomTo(1))
  await page.waitForTimeout(800)
  await canvas.evaluate((c) => (c as unknown as { __globe: Inside }).__globe.zoomTo(8))
  await page.waitForTimeout(1500)
  expect(chunks.length).toBe(1)
})

test('full screen uses the room: the detail comes at once, and it is a shot of the whole screen', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true })
    HTMLElement.prototype.requestFullscreen = () => Promise.resolve()
  })
  const canvas = await crowd(page, 1280, 'dark')
  await page.getByRole('button', { name: 'Full screen' }).click()
  await expect(page.locator('.gwrap')).toHaveClass(/fill/)
  await expect.poll(() => canvas.evaluate((c) => !!(c as unknown as { __globe: Inside }).__globe.det), { timeout: 15_000 }).toBe(true)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${SHOTS}/globe2-1280-dark-full.png` })
})
