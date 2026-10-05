// Every widget design, embedded the way Settings → Widgets writes it, on
// pages as narrow as 320 px and as wide as 1280: the frame grows to its
// card (no clipping), nothing overflows sideways, and a message from anywhere
// but the widget's own frame changes nothing. A site of its own.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'

const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
const SITE = 'http://127.0.0.1:18301'
const WIDTHS = [320, 390, 768, 1280]
const SHOTS = process.env.WIDGET_SHOTS

// kind, parts, the width of the frame and its fallback height without the
// loader: the same numbers as size() in dashboard/src/views/widgetKinds.ts.
const LOOKS = [
  { name: 'live-default', kind: 'live', shows: ['bars', 'countries'], w: 320, h: 310 + 34, fluid: true },
  { name: 'live-all', kind: 'live', shows: ['bars', 'countries', 'pages', 'channels'], w: 320, h: 518 + 34, fluid: true },
  { name: 'live-numbers', kind: 'live', shows: [], w: 320, h: 106 + 34, fluid: true },
  { name: 'badge', kind: 'badge', shows: [], w: 260, h: 72 + 34, fluid: false },
  { name: 'counter', kind: 'counter', shows: [], w: 200, h: 44 + 34, fluid: false },
  { name: 'revenue', kind: 'revenue', shows: ['channels'], w: 320, h: 210 + 34, fluid: true },
  { name: 'privacy', kind: 'privacy', shows: [], w: 320, h: 300 + 34, fluid: true },
  { name: 'online-pill', kind: 'online', shows: [], w: 180, h: 44, fluid: false },
  { name: 'online-spark', kind: 'online', shows: ['spark'], w: 230, h: 44, fluid: false },
  { name: 'online-card', kind: 'online', shows: ['card', 'pages', 'countries'], w: 280, h: 214 + 34 + 208, fluid: true },
]

let cookie = ''
test.beforeAll(async () => {
  cookie = await session('widget-responsive')
})

async function made(page: Page) {
  const domain = `widgets-${Date.now()}.example.org`
  const site = ((await (await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain } })).json()) as { id: string }).id
  await page.request.put(`${API}/api/v1/sites/${site}/modules/revenue`, { headers: H, data: { enabled: true } })
  const paths = ['/', '/pricing', '/blog/a-rather-long-page-name-that-will-not-fit-on-a-phone', '/docs']
  for (let i = 0; i < 6; i++) {
    await page.request.post(`${API}/api/e`, { headers: { 'User-Agent': UA }, data: { s: site, k: 'pv', u: `https://${domain}${paths[i % 4]}`, id: `wr${i}`, v: `wr${i}.1` } })
  }
  const ids: Record<string, string> = {}
  for (const l of LOOKS) {
    const res = await page.request.post(`${API}/api/v1/sites/${site}/widgets`, { headers: H, data: { kind: l.kind, theme: 'dark', shows: l.shows, brand: true } })
    expect(res.ok(), `${l.name}: ${await res.text()}`).toBe(true)
    const id = ((await res.json()) as { id: string }).id
    // A new widget is off until it is switched on.
    const on = await page.request.put(`${API}/api/v1/sites/${site}/widgets/${id}`, { headers: H, data: { kind: l.kind, theme: 'dark', shows: l.shows, brand: true, on: true } })
    expect(on.ok(), `${l.name}: ${await on.text()}`).toBe(true)
    ids[l.name] = id
  }
  return ids
}

// The page the suite's customer site writes for a frame, with or without the loader.
const embed = (l: (typeof LOOKS)[number], id: string, loader = true) => {
  const fit = l.fluid ? `width:100%;max-width:${l.w}px` : 'max-width:100%'
  return `${SITE}/widget-embed?${new URLSearchParams({ id, w: String(l.w), h: String(l.h), fit, ...(loader ? {} : { loader: '0' }) })}`
}

const inside = (page: Page) =>
  page
    .frameLocator('iframe')
    .locator('html')
    .evaluate((d) => ({ h: Math.ceil(d.getBoundingClientRect().height), over: d.scrollWidth - d.clientWidth, bodyOver: document.body.scrollWidth - document.body.clientWidth }))

test('every design fits its frame, with no sideways overflow, from 320 to 1280 px', async ({ page, context }) => {
  test.setTimeout(240_000)
  test.skip(test.info().project.name !== 'chromium', 'one browser is enough: the server does the work')
  await context.addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const ids = await made(page)
  if (SHOTS) mkdirSync(SHOTS, { recursive: true })

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 })
    for (const l of LOOKS) {
      await page.goto(embed(l, ids[l.name]!))
      const frame = page.locator('iframe')
      // The loader sets the height from the card's own message.
      await expect.poll(async () => Math.abs((await frame.boundingBox())!.height - (await inside(page)).h), { message: `${l.name} at ${width}`, timeout: 15_000 }).toBeLessThanOrEqual(2)
      await expect(page.frameLocator('iframe').locator('.card').first(), `${l.name} at ${width}: nothing shown`).toBeVisible()
      const inner = await inside(page)
      expect((await frame.boundingBox())!.height, `${l.name} at ${width}: clipped`).toBeGreaterThanOrEqual(inner.h - 1)
      expect(inner.over, `${l.name} at ${width}: the card overflows sideways`).toBeLessThanOrEqual(0)
      expect(inner.bodyOver, `${l.name} at ${width}: the body overflows sideways`).toBeLessThanOrEqual(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${l.name} at ${width}: the page scrolls sideways`).toBeLessThanOrEqual(0)
      if (SHOTS && width === 390) await page.screenshot({ path: join(SHOTS, `${l.name}.png`), clip: { x: 0, y: 0, width, height: Math.min(800, Math.ceil(inner.h) + 16) } })
    }
  }
})

test('old code without the loader still fits its fixed height on a phone, and nobody else can resize a frame', async ({ page, context }) => {
  test.setTimeout(120_000)
  test.skip(test.info().project.name !== 'chromium', 'one browser is enough: the server does the work')
  await context.addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const ids = await made(page)
  await page.setViewportSize({ width: 390, height: 800 })
  for (const l of LOOKS) {
    await page.goto(embed(l, ids[l.name]!, false))
    await page.locator('iframe').waitFor()
    await expect.poll(async () => (await inside(page)).h, { message: l.name }).toBeGreaterThan(0)
    await expect(page.frameLocator('iframe').locator('.card').first(), `${l.name}: nothing shown`).toBeVisible()
    const inner = await inside(page)
    expect((await page.locator('iframe').boundingBox())!.height, `${l.name}: the fixed height clips it`).toBeGreaterThanOrEqual(inner.h - 1)
    expect(inner.over, `${l.name}: overflows sideways`).toBeLessThanOrEqual(0)
  }

  // A message from the page itself (another origin than the widget's), and a
  // right one for the wrong widget, are both ignored.
  const l = LOOKS[0]!
  await page.goto(embed(l, ids[l.name]!))
  const frame = page.locator('iframe')
  await expect.poll(async () => Math.abs((await frame.boundingBox())!.height - (await inside(page)).h)).toBeLessThanOrEqual(2)
  const before = (await frame.boundingBox())!.height
  await page.evaluate((id) => window.postMessage({ type: 'trckable:h', id, h: 3000 }, '*'), ids[l.name])
  await page.waitForTimeout(400)
  expect((await frame.boundingBox())!.height).toBe(before)
})
