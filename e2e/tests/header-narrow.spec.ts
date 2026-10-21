// The header's controls at every width the page has: the site, the search (where it is a button of its own), the bell, the person
// and a build's own chip are one height, and the gaps between them are one gap. Pictures for the review: HN_SHOTS=<folder>.
import { expect, test, type Page } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'

const SHOTS = process.env.HN_SHOTS
const AUTH = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
const WIDTHS = [390, 463, 600, 700, 900, 1440]
const CONTROLS = ['#siteBtn', '.hd .exb', '.hd .ib.bell', '.hd .account-btn', '.hd .ptop-chip', '.hd .ringb']

let cookie = ''
let longSite = ''
test.beforeAll(async ({ request }) => {
  cookie = await session('header-narrow')
  longSite = `a-very-long-site-name-for-the-header-${Date.now()}.view.example.org`
  await request.post(`${API}/api/v1/sites`, { headers: { ...AUTH, Authorization: 'Bearer e2e-token' }, data: { domain: longSite } })
})

async function boxes(page: Page) {
  const found: { sel: string; x: number; y: number; w: number; h: number }[] = []
  for (const sel of CONTROLS) {
    for (const el of await page.locator(sel).all()) {
      const b = await el.boundingBox()
      if (b && b.width > 0) found.push({ sel, x: b.x, y: b.y, w: b.width, h: b.height })
    }
  }
  return found.sort((a, b) => a.x - b.x)
}

for (const scheme of ['dark', 'light'] as const)
  for (const w of WIDTHS)
    for (const long of [false, true]) {
      if (long && (scheme === 'light' || w > 700)) continue
      test(`header controls at ${w}px, ${scheme}${long ? ', a long site name' : ''}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme })
        await page.setViewportSize({ width: w, height: 800 })
        await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
        await page.goto(`${API}/${long ? longSite : 'example.com'}`)
        await expect(page.locator('.hd .account-btn')).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(400)
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/${process.env.HN_TAG ?? 'after'}-${w}-${scheme}${long ? '-long' : ''}.png`, clip: { x: 0, y: 0, width: w, height: 130 } })
        const row = await boxes(page)
        expect(row.map((c) => c.sel), 'the controls on the row').toEqual(expect.arrayContaining(['#siteBtn', '.hd .ib.bell', '.hd .account-btn']))
        // The setup ring is a bare ring, not a box: it counts for the gaps and the centre line, not for the height.
        const hs = new Set(row.filter((c) => c.sel !== '.hd .ringb').map((c) => Math.round(c.h * 10) / 10))
        expect([...hs], `one height ${JSON.stringify(row)}`).toHaveLength(1)
        if (w <= 700) expect([...hs][0]).toBe(40)
        const mids = row.map((c) => c.y + c.h / 2)
        expect(Math.max(...mids) - Math.min(...mids), `one centre line ${JSON.stringify(row)}`).toBeLessThanOrEqual(0.5)
        // The right group (from the bell back to whatever sits before it) has one gap; with no spacer (600 and under) the site joins it, unless it is only its mark and dot, which keeps its own width.
        const gaps = row.slice(1).map((c, i) => Math.round((c.x - row[i].x - row[i].w) * 10) / 10)
        const right = ['.hd .exb', '.hd .ptop-chip', '.hd .ib.bell', '.hd .account-btn']
        const group = w <= 600 ? gaps.filter((_, i) => row[i].sel !== '#siteBtn') : gaps.filter((_, i) => right.includes(row[i].sel) && right.includes(row[i + 1].sel))
        expect(new Set(group).size, `gaps ${JSON.stringify(gaps)} ${JSON.stringify(row)}`).toBe(1)
        expect(group.every((g) => g === 12), `gaps ${JSON.stringify(gaps)}`).toBe(true)
        const last = row[row.length - 1]
        expect(last.sel, 'the person is the last control at the right').toBe('.hd .account-btn')
        expect(row.map((c) => c.sel).indexOf('.hd .ib.bell'), 'the bell is just before the person').toBe(row.length - 2)
        expect(last.x + last.w, 'nothing leaves the screen').toBeLessThanOrEqual(w)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll').toBe(true)
      })
    }
