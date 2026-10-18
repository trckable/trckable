// Page speed, end to end: a real Chromium loads a page that is slow on purpose (a hero that comes late, which is a slow
// LCP and a layout shift, and a button that holds the main thread, which is a slow interaction) with the site's real
// script. The web-vitals library runs in the same page and is the ground truth. The tracker's beacon must reach the
// server, the server must store it, and the Speed section of Explore must show the 75th percentile of what the
// browsers measured, with the device, the page, and the right grade; a site with too few visits shows no number.
import { expect, test, type BrowserContext, type Page } from './fixtures'
import { API, TOKEN } from '../playwright.config'
import { session } from './session'
import { PORT, origin } from '../ports'

test.skip(({ browserName }) => browserName !== 'chromium', 'the metrics are Chromium\'s')

const SITE_ORIGIN = origin(PORT.site)
const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN }
const MIN = 5 // visits a score needs (dashboard MIN_VITALS)

let cookie = ''
test.beforeAll(async () => {
  cookie = await session('web-vitals')
})

type Truth = { lcp: number; cls: number; inp: number }

/** The 75th percentile the way the server computes it: linear between the closest ranks. */
const p75 = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const at = (s.length - 1) * 0.75
  const lo = Math.floor(at)
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (at - lo)
}

async function newSite(page: Page, label: string) {
  const domain = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.example.org`
  const made = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain } })
  expect(made.ok()).toBe(true)
  return { domain, id: ((await made.json()) as { id: string }).id }
}

/** One visit: the page loads, shifts, is tapped, and is left, as a visitor does. What the library saw is returned. */
async function visit(context: BrowserContext, site: string, path: string): Promise<Truth> {
  const page = await context.newPage()
  await page.goto(`${SITE_ORIGIN}/vitals/${site}/${path}`)
  await page.locator('#hero').waitFor()
  await page.waitForFunction(() => (window as any).__wv.lcp != null && (window as any).__wv.cls != null)
  await page.locator('#buy').click()
  await page.waitForFunction(() => (window as any).__wv.inp != null)
  await page.waitForTimeout(300) // the tap's frame is drawn
  const truth = (await page.evaluate(() => (window as any).__wv)) as Truth
  await page.close() // the page is hidden and gone: the tracker sends
  return truth
}

const today = () => new Date().toISOString().slice(0, 10)
const yesterday = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)

/** What the server reports, once the writer has stored the beacons (about a second). */
async function stored(page: Page, site: string, views: number) {
  type Out = { samples: number; lcp_n: number; lcp_ms?: number; cls_1k?: number; inp_ms?: number; cls_n: number; inp_n: number; good: number; pages?: { value: string; visitors: number; pageviews: number }[]; devices?: { value: string; n: number; lcp_ms?: number }[] }
  let out!: Out
  await expect(async () => {
    const r = await page.request.get(`${API}/api/v1/sites/${site}/report/vitals?from=${yesterday()}&to=${today()}`, { headers: H })
    expect(r.ok()).toBe(true)
    out = (await r.json()) as Out
    expect(out.samples).toBe(views)
  }).toPass({ timeout: 30_000, intervals: [500, 1000, 1500] })
  return out
}

test('the tracker sends what Chromium measured, the server keeps it, and Speed shows the 75th percentile', async ({ page, context }) => {
  test.setTimeout(150_000)
  await context.addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const { domain, id } = await newSite(page, 'vitals')
  const truths: Truth[] = []
  for (let i = 0; i < MIN + 1; i++) truths.push(await visit(context, id, 'pricing'))

  // The page really was slow and unstable, and the library says so: a test of a page that scored well proves nothing.
  const want = { lcp: p75(truths.map((t) => t.lcp)), cls: p75(truths.map((t) => t.cls)) * 1000, inp: p75(truths.map((t) => t.inp)) }
  expect(want.lcp).toBeGreaterThan(2500) // over Google's "good"
  expect(want.cls).toBeGreaterThan(100)
  expect(want.inp).toBeGreaterThan(200)

  // Stored: one sample per page view, whatever the number of reports, each score from every view, the page and the device.
  const out = await stored(page, id, MIN + 1)
  expect([out.lcp_n, out.cls_n, out.inp_n]).toEqual([MIN + 1, MIN + 1, MIN + 1])
  expect(Math.abs(out.lcp_ms! - want.lcp), `LCP ${out.lcp_ms} vs the library's ${want.lcp}`).toBeLessThanOrEqual(80)
  expect(Math.abs(out.cls_1k! - want.cls), `CLS ${out.cls_1k} vs the library's ${want.cls}`).toBeLessThanOrEqual(8)
  expect(Math.abs(out.inp_ms! - want.inp), `INP ${out.inp_ms} vs the library's ${want.inp}`).toBeLessThanOrEqual(24)
  expect(out.good).toBe(0) // none of the three is in the green
  expect(out.pages?.[0]).toMatchObject({ value: `/vitals/${id}/pricing`, pageviews: MIN + 1 })
  expect(out.devices?.map((d) => d.value)).toEqual(['Desktop'])

  // Shown: the same numbers, each with its grade, and the page and the device.
  await page.goto(`${API}/${domain}?view=briefing&x=speed&period=7d&v=`)
  const cards = page.locator('#xp .kcs.k3 .kc')
  await expect(cards).toHaveCount(3, { timeout: 15_000 })
  const lcp = (out.lcp_ms! / 1000).toFixed(1)
  await expect(cards.nth(0)).toContainText(`${lcp} s`)
  await expect(cards.nth(0)).toContainText(out.lcp_ms! > 4000 ? 'Poor' : 'Needs work')
  await expect(cards.nth(1)).toContainText(`${Math.round(out.inp_ms!)} ms`)
  await expect(cards.nth(2)).toContainText((out.cls_1k! / 1000).toFixed(2))
  await expect(cards.nth(2)).toContainText(/Needs work|Poor/)
  await expect(page.locator('#xp')).toContainText(`/vitals/${id}/pricing`)
  await expect(page.locator('#xp')).toContainText('Desktop')
})

test('a site with too few visits shows no number', async ({ page, context }) => {
  test.setTimeout(90_000)
  await context.addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const { domain, id } = await newSite(page, 'vitals-few')
  for (let i = 0; i < 2; i++) await visit(context, id, 'pricing')
  const out = await stored(page, id, 2)
  expect(out.lcp_n).toBe(2)

  await page.goto(`${API}/${domain}?view=briefing&x=speed&period=7d&v=`)
  const cards = page.locator('#xp .kcs.k3 .kc')
  await expect(cards).toHaveCount(3, { timeout: 15_000 })
  for (let i = 0; i < 3; i++) await expect(cards.nth(i)).toContainText('not enough yet: 2 of 5 visits')
  await expect(page.locator('#xp')).not.toContainText(/\d\.\d s\b/)
})
