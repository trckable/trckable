// A refresh of the dashboard is one picture: the page's own boxes (a skeleton of the real layout, painted
// before any JavaScript, with the site's name in it), then the numbers in the same places. No loading ghost
// on the way, no layout of another shape, nothing that moves. A hard reload at 1440 and 390 wide.
// Pictures for the review: POLISH_SHOTS=<folder>.
import { expect, test, type Page } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

const SHOTS = process.env.POLISH_SHOTS
const URL = `${API}/${HISTORY_DOMAIN}?view=data&v=story&period=30d`

/** One ordinary visit: the page keeps what a refresh paints from (lib/bootCache.ts). */
async function warm(page: Page) {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('skeleton'), url: API }])
  await page.goto(URL)
  await expect(page.locator('.sv-chart')).toBeVisible({ timeout: 30_000 })
  // The boxes' heights are kept once the story has stopped changing size: wait until what is kept stands still.
  let last = ''
  await expect
    .poll(
      async () => {
        const now = await page.evaluate(() => localStorage.getItem('trckable:boot') ?? '')
        const still = now !== '' && now === last && JSON.parse(now).h > 0
        last = now
        await page.waitForTimeout(1200)
        return still
      },
      { timeout: 30_000 },
    )
    .toBe(true)
}

/** Holds the app's first question, so the skeleton stays up until `release()`. */
async function hold(page: Page) {
  let release = () => {}
  const held = new Promise<void>((r) => (release = r))
  await page.route('**/api/v1/setup', async (route) => {
    await held
    await route.continue()
  })
  return release
}

const rect = (page: Page, selector: string) =>
  page.evaluate((s) => {
    const el = [...document.querySelectorAll(s)].find((x) => (x as HTMLElement).offsetParent !== null)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y + scrollY, w: r.width, h: r.height }
  }, selector)

for (const width of [1440, 390]) {
  // fixme: the boxes are the old Story view's; the one header (v2/PageHeader) moved its head.
  test.fixme(`a hard reload at ${width}px paints the boxes at once, and the numbers land in them`, async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'layout shifts are read in Chromium')
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await warm(page)
    // A watcher that outlives the reload: the ghost must never show on the dashboard, and shifts are summed.
    await page.addInitScript(() => {
      const w = window as unknown as { ghost: boolean; cls: number }
      w.ghost = false
      w.cls = 0
      new PerformanceObserver((l) => l.getEntries().forEach((e) => (w.cls += (e as unknown as { value: number }).value))).observe({ type: 'layout-shift', buffered: true })
      // Frame by frame, as a person sees it (a frame is only drawn once the styles are in).
      const look = () => {
        // The ghost is a fixed layer: drawn when it has a box (a hidden parent gives it none).
        if (document.querySelector('.ld-page')?.getClientRects().length) w.ghost = true
        requestAnimationFrame(look)
      }
      requestAnimationFrame(look)
    })
    const release = await hold(page)
    await page.goto(URL, { waitUntil: 'commit' })
    // First paint: one skeleton, announced as a status, the site's name in it, no ghost.
    const boxes = page.locator('.dsk:visible')
    await expect(boxes).toHaveCount(1)
    await expect(boxes).toHaveAttribute('role', 'status')
    await expect(page.locator('.ld-page:visible')).toHaveCount(0)
    const name = await page.locator('.dsk:visible .dsk-name').evaluate((el) => getComputedStyle(el, '::after').content)
    expect(name).toContain(HISTORY_DOMAIN)
    const skeleton = { tile: await rect(page, '.dsk-tile'), chart: await rect(page, '.dsk-chart'), answer: await rect(page, '.dsk-answer'), head: await rect(page, '.dsk-head') }
    if (SHOTS) {
      for (const scheme of ['dark', 'light'] as const) {
        await page.emulateMedia({ colorScheme: scheme })
        await page.screenshot({ path: `${SHOTS}/polish-skeleton-${width}-${scheme}.png` })
      }
    }
    release()
    await expect(page.locator('.sv-tiles .kit-card').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.sv-chart')).toBeVisible()
    await expect(page.locator('.dsk, .dsk-inline')).toHaveCount(0)
    const real = { tile: await rect(page, '.sv-tiles .kit-card'), chart: await rect(page, '.sv-chart'), answer: await rect(page, '.sv-answer'), head: await rect(page, '.sv-head') }
    for (const key of ['head', 'tile', 'chart', 'answer'] as const) {
      const a = skeleton[key]!
      const b = real[key]!
      for (const k of ['x', 'y', 'w', 'h'] as const) expect(Math.abs(a[k] - b[k]), `${key}.${k}: skeleton ${a[k]}, page ${b[k]}`).toBeLessThanOrEqual(2)
    }
    // No ghost on the way, and no layout shift to speak of: the numbers came into their places.
    await page.waitForTimeout(1000)
    const seen = await page.evaluate(() => {
      const w = window as unknown as { ghost: boolean; cls: number }
      return { ghost: w.ghost, cls: w.cls }
    })
    expect(seen.ghost).toBe(false)
    expect(seen.cls).toBeLessThan(0.02)
  })
}

test('a first visit with nothing kept still shows the ghost, never the dashboard’s boxes', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('skeleton'), url: API }])
  const release = await hold(page)
  await page.goto(URL, { waitUntil: 'commit' })
  await expect(page.locator('.dsk:visible')).toHaveCount(0)
  await expect(page.getByRole('status', { name: /loading/i }).first()).toBeVisible()
  release()
})

test('the sign-in page never shows the dashboard’s boxes, even with a kept list', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('trckable:boot', JSON.stringify({ s: [{ d: 'a.example', n: 'a', e: 1 }], k: 0 })))
  await page.goto(`${API}/login`, { waitUntil: 'commit' })
  await expect(page.locator('.dsk:visible')).toHaveCount(0)
})

test('period and filter changes keep the numbers on screen, dimmed (no skeleton)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await warm(page)
  await page.goto(URL)
  await expect(page.locator('.sv-chart')).toBeVisible({ timeout: 30_000 })
  await page.evaluate(() => {
    const w = window as unknown as { bad: string[] }
    w.bad = []
    const tick = () => {
      if (document.querySelector('.dsk-inline, .dsk')) w.bad.push('skeleton')
      if (!document.querySelector('.sv-chart')) w.bad.push('chart gone')
      requestAnimationFrame(tick)
    }
    tick()
  })
  await page.keyboard.press('7')
  await expect(page.locator('.sv-head')).toBeVisible()
  await page.waitForTimeout(1500)
  expect(await page.evaluate(() => (window as unknown as { bad: string[] }).bad)).toEqual([])
})

test('an automatic refresh is silent: no skeleton, no bar, no dimming, no shimmer', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await warm(page)
  await page.clock.install()
  await page.goto(URL)
  await expect(page.locator('.sv-chart')).toBeVisible({ timeout: 30_000 })
  await page.evaluate(() => {
    const w = window as unknown as { seen: string[] }
    w.seen = []
    const look = () => {
      for (const s of ['.skel', '.dsk', '.dsk-inline', '.loadbar', '.pending', '.ld', '.sv-veil']) if (document.querySelector(s)) w.seen.push(s)
      requestAnimationFrame(look)
    }
    look()
  })
  let reads = 0
  page.on('request', (r) => /\/report\?/.test(r.url()) && reads++)
  await page.clock.runFor(31_000) // the page's own 30 s refresh of a period that includes today
  await page.clock.runFor(2_000)
  await expect.poll(() => reads).toBeGreaterThan(0) // it did read again
  expect(await page.evaluate(() => [...new Set((window as unknown as { seen: string[] }).seen)])).toEqual([])
  await expect(page.locator('.sv-chart')).toBeVisible()
})
