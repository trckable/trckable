// Moving between Explore's tabs moves nothing around the numbers: the header and the list of sections keep their place and
// size, the page's width does not change (a scrollbar coming or going), Live stays hidden behind Explore, and one panel is
// in the page after every switch.
import { expect, test, type Frame, type Page } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the layout')
test.use({ viewport: { width: 1440, height: 900 } })

const URL = `${API}/${HISTORY_DOMAIN}?view=briefing&period=7d`
const WATCHED = ['.hd', '.xrail', '#xp .xlay']

let cookie = ''
test.beforeAll(async () => {
  cookie = await session('explore-no-shift')
})

type Box = { x: number; y: number; w: number; h: number }
const rects = (f: Page | Frame) =>
  f.evaluate((sels) => {
    const out: Record<string, Box | null> = { page: { x: 0, y: 0, w: document.documentElement.clientWidth, h: 0 } }
    for (const s of sels) {
      const r = document.querySelector(s)?.getBoundingClientRect()
      out[s] = r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null
    }
    return out
  }, WATCHED)

async function tabs(f: Page | Frame): Promise<string[]> {
  return f.locator('[data-xtab], [data-xsec]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.xtab ?? `sec:${(e as HTMLElement).dataset.xsec}`))
}

async function click(f: Page | Frame, id: string) {
  const sel = id.startsWith('sec:') ? `[data-xsec="${id.slice(4)}"]` : `[data-xtab="${id}"]`
  await f.locator(sel).first().click()
  await f.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 250))))
}

async function walk(f: Page | Frame, host: () => Promise<number> | number) {
  await expect(f.locator('#xp.on')).toBeVisible()
  await expect(f.locator('.xrail')).toBeVisible()
  const ids = await tabs(f)
  expect(ids.length).toBeGreaterThan(3)
  await click(f, ids[0])
  const base = await rects(f)
  const y = await host()
  for (const id of ids) {
    await click(f, id)
    const now = await rects(f)
    for (const one of ['#xp', '.xrail', '#xpBody']) await expect(f.locator(one), `${one} after ${id}`).toHaveCount(1)
    // A table further down its section's page is scrolled to: things then stand higher on the screen, which is the scroll, not a shift.
    const scrolled = await f.evaluate(() => scrollY > 0)
    for (const [key, b] of Object.entries(base)) {
      if (!b) continue
      const n = now[key]
      expect(n, `${key} after ${id}`).not.toBeNull()
      for (const k of key === 'page' ? (['x', 'w'] as const) : key === '.xrail' ? (['x', 'w'] as const) : (scrolled ? (['x', 'w'] as const) : (['x', 'w', 'y'] as const))) expect(Math.abs(n![k] - b[k]), `${key}.${k} after ${id}`).toBeLessThanOrEqual(0.5)
    }
    expect(await host(), `the outer page's scroll after ${id}`).toBe(y)
  }
}

test('no Explore tab moves the header, the list of sections or the page width', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(URL)
  await walk(page, () => 0)
  // Live is not in the page behind Explore.
  await expect(page.locator('.view-pane[hidden]')).toHaveCount(1)
  expect(await page.locator('.view-pane:not([hidden]) #xp').count()).toBe(1)
})

// The app refuses to be framed, so the website's demo is checked by what moves a framing page: scrollIntoView scrolls every
// window above the one it is called in. A tab may move its own window (scrollTo), never ask for that.
test('a tab never asks the browser to scroll the pages above this one', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.addInitScript(() => {
    ;(window as unknown as { asked: number }).asked = 0
    Element.prototype.scrollIntoView = () => void ((window as unknown as { asked: number }).asked += 1)
  })
  await page.goto(URL)
  await page.evaluate(() => scrollTo(0, 200))
  await walk(page, () => page.evaluate(() => (window as unknown as { asked: number }).asked))
})
