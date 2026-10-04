// The trckable mark on every widget, in every theme, on every accent: drawn
// for real, measured against the widget's own background. A light widget must
// not lose its ghost on white (lime on white is about 1.2 to 1), so the ghost
// gets an ink outline there. The brand line sits inside the card, so it keeps
// the card's own contrast on any host page. Also writes two contact sheets (to
// SHEET_OUT, default test-results/widget-logo-sheet.png, and the brand line on
// white, black and mid-grey hosts to HOSTS_OUT, default
// test-results/widget-brand-hosts.png).
import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { API } from '../playwright.config'
import { session } from './session'

const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
const DESIGNS = [
  { name: 'live', kind: 'live', shows: 'bars,countries,pages,channels' },
  { name: 'badge', kind: 'badge', shows: 'ai' },
  { name: 'counter', kind: 'counter', shows: '' },
  { name: 'revenue', kind: 'revenue', shows: 'channels' },
  { name: 'privacy', kind: 'privacy', shows: '' },
  { name: 'online pill', kind: 'online', shows: '' },
  { name: 'online pill + graph', kind: 'online', shows: 'spark' },
  { name: 'online card', kind: 'online', shows: 'card,pages,countries' },
]
// The widget's theme, and the page's colour scheme it is set on: a fixed theme
// is tried on the opposite scheme, which is the harder one.
const GROUNDS = [
  { name: 'dark', theme: 'dark', scheme: 'light' as const, page: '#ffffff' },
  { name: 'light', theme: 'light', scheme: 'dark' as const, page: '#0b0d10' },
  { name: 'auto on a dark page', theme: 'auto', scheme: 'dark' as const, page: '#0b0d10' },
  { name: 'auto on a light page', theme: 'auto', scheme: 'light' as const, page: '#ffffff' },
]
const ACCENTS = ['', '#38bdf8', '#818cf8', '#f472b6', '#fb923c', '#facc15']
// The mark's lowest contrast against the widget's own background, and the
// words' (small type needs more).
const MARK_MIN = 3
const WORDS_MIN = 4.5

// Measured in the page: WCAG relative luminance of the computed colours.
const measure = () => {
  const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
  const lum = (c: string) => {
    const [r, g, b] = rgb(c).map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }
  // What the mark and the name sit on: the nearest background that paints.
  // Nothing painted behind them means they sit on the customer's page, which
  // is not known: that is a failure of its own.
  const behind = (el: Element | null) => {
    for (; el; el = el.parentElement) {
      const c = getComputedStyle(el).backgroundColor
      if (rgb(c).length === 3 && !/rgba\(.*,\s*0\)$/.test(c) && c !== 'transparent') return c
    }
    return ''
  }
  const svg = document.querySelector('.by svg, .gh svg')
  if (!svg) return null
  const bg = behind(svg)
  if (!bg) return { mark: 0, words: 0 }
  const edge = (el: Element) => {
    const s = getComputedStyle(el)
    return s.stroke !== 'none' && parseFloat(s.strokeWidth) > 0 ? s.stroke : s.fill
  }
  const paths = [...svg.querySelectorAll('path')]
  const mark = Math.min(ratio(edge(paths[0]), bg), ratio(edge(paths[paths.length - 1]), bg))
  const words = [...document.querySelectorAll('.by b, .by span')].map((el) => ratio(getComputedStyle(el).color, bg))
  return { mark, words: words.length ? Math.min(...words) : null }
}

let cookie = ''
test.beforeAll(async () => {
  cookie = await session('widget-logo-contrast')
})

test('the trckable mark and name keep their contrast on every widget, theme and colour', async ({ page, context, browser }) => {
  test.setTimeout(300_000)
  test.skip(test.info().project.name !== 'chromium', 'one browser is enough: the page is the server`s')
  await context.addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const made = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain: `logo-${Date.now()}.example.org` } })
  const site = ((await made.json()) as { id: string }).id
  await page.request.put(`${API}/api/v1/sites/${site}/modules/revenue`, { headers: H, data: { enabled: true } })
  await page.setViewportSize({ width: 360, height: 700 })

  const failures: string[] = []
  const cells: { design: string; accent: string; ground: string; page: string; png: string }[] = []
  for (const d of DESIGNS) {
    for (const a of ACCENTS) {
      for (const g of GROUNDS) {
        await page.emulateMedia({ colorScheme: g.scheme })
        const q = new URLSearchParams({ kind: d.kind, theme: g.theme, accent: a, radius: '16', shows: d.shows, lang: 'en' })
        await page.goto(`${API}/api/v1/sites/${site}/widgets/preview?${q}`)
        const got = await page.evaluate(measure)
        const label = `${d.name} · ${g.name} · ${a || 'own'}`
        if (!got) {
          failures.push(`${label}: no trckable mark on the page`)
          continue
        }
        if (got.mark < MARK_MIN) failures.push(`${label}: mark ${got.mark.toFixed(2)}:1`)
        if (got.words !== null && got.words < WORDS_MIN) failures.push(`${label}: name ${got.words.toFixed(2)}:1`)
        const box = (await page.locator('body').boundingBox())!
        const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: Math.ceil(box.width), height: Math.ceil(box.height) + 4 } })
        cells.push({ design: d.name, accent: a || 'own', ground: g.name, page: g.page, png: png.toString('base64') })
      }
    }
  }

  // One sheet: a row per design and colour, a column per background.
  const sheet = await browser.newPage({ viewport: { width: 1500, height: 800 } })
  const rows = DESIGNS.flatMap((d) => ACCENTS.map((a) => ({ d: d.name, a: a || 'own' })))
  const html = rows
    .map((r) => {
      const tds = GROUNDS.map((g) => {
        const c = cells.find((x) => x.design === r.d && x.accent === r.a && x.ground === g.name)
        return `<td style="background:${g.page}">${c ? `<img src="data:image/png;base64,${c.png}">` : ''}</td>`
      }).join('')
      return `<tr><th>${r.d}<br>${r.a}</th>${tds}</tr>`
    })
    .join('')
  await sheet.setContent(`<style>body{margin:0;font:12px system-ui;background:#888}table{border-collapse:collapse}th{width:140px;text-align:left;padding:6px;background:#eee}td{width:340px;padding:8px;vertical-align:middle;border:1px solid #888}img{display:block}</style>
<table><tr><th></th>${GROUNDS.map((g) => `<th>${g.name}</th>`).join('')}</tr>${html}</table>`)
  const out = process.env.SHEET_OUT ?? 'test-results/widget-logo-sheet.png'
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, await sheet.screenshot({ fullPage: true }))
  await sheet.close()

  // The brand line on the three hosts a page is likely to have.
  const HOSTS = [
    { name: 'white', page: '#ffffff' },
    { name: 'black', page: '#000000' },
    { name: 'grey', page: '#808080' },
  ]
  const hostSheet = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  const hostRows = DESIGNS.flatMap((d) => GROUNDS.map((g) => ({ d: d.name, g: g.name })))
  const hostHtml = hostRows
    .map((r) => {
      const c = cells.find((x) => x.design === r.d && x.accent === 'own' && x.ground === r.g)
      const tds = HOSTS.map((h) => `<td style="background:${h.page}">${c ? `<img src="data:image/png;base64,${c.png}">` : ''}</td>`).join('')
      return `<tr><th>${r.d}<br>${r.g}</th>${tds}</tr>`
    })
    .join('')
  await hostSheet.setContent(`<style>body{margin:0;font:12px system-ui;background:#888}table{border-collapse:collapse}th{width:150px;text-align:left;padding:6px;background:#eee}td{width:340px;padding:8px;vertical-align:middle;border:1px solid #888}img{display:block}</style>
<table><tr><th></th>${HOSTS.map((h) => `<th>${h.name}</th>`).join('')}</tr>${hostHtml}</table>`)
  const hostsOut = process.env.HOSTS_OUT ?? 'test-results/widget-brand-hosts.png'
  mkdirSync(dirname(hostsOut), { recursive: true })
  writeFileSync(hostsOut, await hostSheet.screenshot({ fullPage: true }))
  await hostSheet.close()

  expect(failures).toEqual([])
})
