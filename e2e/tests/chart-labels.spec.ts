// Every word and mark in the Briefing chart's plot has a place of its own: none is over another, none over the line,
// the moment label speaks in the interface's face, the biggest jump's line is in the header row (not on the plot),
// and the stretch before the site's first visit is shaded, with no usual band and no line in it. Checked on a month
// with a peak on its first and its last day, a source behind most rises and a first day of data in the middle.
import { expect, test, type Page } from './fixtures'
import { API, LABELS_DOMAIN } from '../playwright.config'
import { session } from './session'

test.skip(({ browserName }) => browserName !== 'chromium', 'one browser is enough: the page is the same')

let cookie = ''
test.beforeAll(async () => {
  cookie = await session('chart-labels')
})

interface Seen {
  name: string
  l: number
  t: number
  r: number
  b: number
}

async function read(page: Page) {
  return page.evaluate(() => {
    const svg = document.querySelector<SVGSVGElement>('svg#chart')!
    const s = svg.getBoundingClientRect()
    const vb = svg.viewBox.baseVal
    const box = (name: string, el: Element): Seen => {
      const r = el.getBoundingClientRect()
      return { name, l: r.left, t: r.top, r: r.right, b: r.bottom }
    }
    const shown = (el: Element) => !el.hasAttribute('data-hidden') && el.getBoundingClientRect().width > 0
    const labels = [...document.querySelectorAll('.chwrap [data-lbl]')].filter(shown).map((e) => box(`${e.tagName} ${e.textContent?.trim().slice(0, 24)}`, e))
    const marks = [...document.querySelectorAll('.chwrap .moment-mark')].filter(shown).map((e, i) => box(`moment mark ${i}`, e))
    const texts = [...svg.querySelectorAll('text:not([data-lbl])')].map((e) => box(`text ${e.textContent?.trim()}`, e)).filter((b) => b.r > b.l)
    const more = [...document.querySelectorAll('.lbl-more')].filter(shown).map((e) => box('more', e))
    const first = svg.querySelectorAll('polyline')[0]?.getAttribute('points') ?? ''
    const line = first.split(' ').map((p) => p.split(',').map(Number)).map(([x, y]) => [s.left + (x * s.width) / vb.width, s.top + (y * s.height) / vb.height])
    const rise = document.querySelector('svg#chart text.lbl')
    return {
      labels,
      marks,
      texts,
      more,
      line,
      svg: { l: s.left, r: s.right, w: s.width, h: s.height },
      callInHeader: !!document.querySelector('.ch-top #chCall'),
      oldLine: document.querySelectorAll('.sm-line').length,
      riseFont: rise ? getComputedStyle(rise).fontFamily : '',
      before: [...svg.querySelectorAll('text')].some((t) => t.textContent === 'Before the first visit'),
      shade: svg.querySelectorAll('rect[fill="var(--mk-nowshade)"]').length,
    }
  })
}

const apart = (a: Seen, b: Seen) => a.r <= b.l + 0.5 || b.r <= a.l + 0.5 || a.b <= b.t + 0.5 || b.b <= a.t + 0.5

function onLine(b: Seen, line: number[][]) {
  for (let i = 0; i + 1 < line.length; i++) {
    const [x0, y0] = line[i]
    const [x1, y1] = line[i + 1]
    for (let k = 0; k <= 40; k++) {
      const x = x0 + ((x1 - x0) * k) / 40
      const y = y0 + ((y1 - y0) * k) / 40
      if (x > b.l && x < b.r && y > b.t && y < b.b) return true
    }
  }
  return false
}

for (const width of [1440, 2000, 390]) {
  test(`the chart's words and marks each have their own place (${width}px)`, async ({ page }) => {
    await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(`${API}/${LABELS_DOMAIN}?view=briefing&period=30d`)
    await expect(page.locator('svg#chart')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.chlay .sm-mark, .chlay .moment-mark').first()).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(1200)
    const r = await read(page)
    const all = [...r.labels, ...r.marks, ...r.texts, ...r.more]
    expect(r.labels.length + r.marks.length, 'something is drawn in the plot').toBeGreaterThan(1)
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(apart(all[i], all[j]), `${all[i].name} and ${all[j].name} overlap`).toBe(true)
    for (const b of [...r.labels, ...r.marks]) expect(onLine(b, r.line), `${b.name} is over the line`).toBe(false)
    for (const b of [...r.labels, ...r.marks, ...r.texts]) expect(b.l >= r.svg.l - 1 && b.r <= r.svg.r + 1, `${b.name} leaves the chart`).toBe(true)
    // The main card's chart is tall enough for its lanes: markers, the period's label, then the plot.
    expect(r.svg.h).toBeGreaterThanOrEqual(width > 600 ? 260 : 160)
    expect(r.callInHeader, "the jump's line is in the header row").toBe(true)
    expect(r.oldLine, 'no line on the plot').toBe(0)
    expect(r.riseFont).not.toMatch(/mono|menlo/i)
    // Before the first visit: shaded, and the line begins where the data does (13 of 30 days in).
    expect(r.shade).toBeGreaterThan(0)
    expect(r.line[0][0]).toBeGreaterThan(r.svg.l + r.svg.w * 0.35)
    if (width > 600) expect(r.before).toBe(true)
  })
}
