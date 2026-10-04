// How a heatmap is laid over a page: pure arithmetic, so it is tested without
// a browser (model.test.ts). The server sends counters per element and the
// element's average place and size; this turns them into points on the page.
import type { HeatMap, Spot, Width } from './api'

export const MIN_W = 320
export const MAX_W = 1920
export const MIN_H = 600
export const MAX_H = 20_000

/** What the window of each width shows at once, in pixels: where the first screen ends. */
export const FIRST_SCREEN: Record<Width, number> = { 390: 700, 768: 900, 1280: 800 }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** The page as it was looked at: its average window width and height, or the bucket's own when nothing says. */
export function pageSize(m: Pick<HeatMap, 'width' | 'window' | 'height'>): { w: number; h: number } {
  return { w: clamp(m.window || m.width, MIN_W, MAX_W), h: clamp(m.height || 3000, MIN_H, MAX_H) }
}

/** Where a click landed on the page, in page pixels: the element's average place, and the tenth of it. */
export function place(s: Spot, pageW: number): { x: number; y: number } {
  const left = (s.x / 1000) * pageW
  const width = (s.w / 1000) * pageW
  return { x: left + ((s.cx + 0.5) / 10) * width, y: s.y + ((s.cy + 0.5) / 10) * s.h }
}

/** How strongly a spot shows, 0.18 to 1: the square root keeps one busy button from hiding every other. */
export function strength(n: number, max: number): number {
  if (max <= 0) return 0
  return clamp(Math.sqrt(n / max), 0.18, 1)
}

/** The size of a spot's glow in page pixels: a wide element gets a wider one, within bounds. */
export function glow(s: Spot, pageW: number): number {
  return clamp(((s.w / 1000) * pageW) / 3, 24, 56)
}

/** The most clicks any one spot has. */
export const busiest = (spots: readonly Spot[]) => spots.reduce((m, s) => Math.max(m, s.n), 0)

/** A scroll map's colour: everyone reached it is hot, almost nobody cold. */
export function heatColor(reach: number): string {
  const hue = Math.round((1 - clamp(reach, 0, 1)) * 220)
  return `hsl(${hue} 85% 50% / 0.38)`
}

/** The page's own depth as a vertical gradient: the first screen is seen by everyone, and below it the share that got that far. */
export function scrollGradient(reach: readonly number[], pageH: number, first: number): string {
  if (reach.length === 0 || pageH <= 0) return 'none'
  const f = Math.min(first, pageH)
  const at = (px: number) => `${((px / pageH) * 100).toFixed(2)}%`
  const stops = [`${heatColor(1)} 0%`, `${heatColor(1)} ${at(f)}`]
  reach.forEach((r, i) => stops.push(`${heatColor(r)} ${at(f + (((i + 1) * 10) / 100) * (pageH - f))}`))
  return `linear-gradient(to bottom, ${stops.join(', ')})`
}

/** How much to shrink a page that is wider than the room it is shown in. */
export const fit = (room: number, pageW: number) => (room >= pageW || room <= 0 ? 1 : room / pageW)

/** The page for the frame: a page of this server that frames the site's own page (it checks the site allows it, and says so when it does not). The dashboard itself never frames another site. */
export const frameSrc = (site: string, path: string) => `/api/v1/sites/${encodeURIComponent(site)}/heat-frame?path=${encodeURIComponent(path)}`

/** A page that does something just by being opened: never loaded for a heatmap (the server refuses it too); any segment of the path counts. */
export const isRisky = (path: string) => /(^|\/)((log|sign)[-_]?(out|off)|unsubscribe)\b/i.test(path)

/** The widths that have views, busiest first; the others stay in the switch, disabled. */
export const hasViews = (m: Pick<HeatMap, 'widths'>, w: Width) => (m.widths.find((x) => x.width === w)?.views ?? 0) > 0

// ---- example data: the preview on the card, with nothing recorded ----

/** A small deterministic sequence, so the example looks the same every time. */
function seeded(seed: number) {
  let s = seed
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
}

/** An example page's heatmap at one width: a hero, a pricing row and a footer, with clicks gathering on the main button. */
export function exampleHeat(width: Width): HeatMap {
  const rnd = seeded(width)
  const w = width
  const h = width === 390 ? 3200 : 2400
  // x and w are thousandths of the window, y and h pixels, as the server sends them.
  const el = (name: string, x: number, y: number, ew: number, eh: number, n: number, cells: number): Spot[] =>
    Array.from({ length: cells }, (_, i) => ({
      el: name,
      cx: (i * 3 + Math.floor(rnd() * 3)) % 10,
      cy: Math.floor(rnd() * 10),
      n: Math.max(1, Math.round((n / cells) * (0.4 + rnd()))),
      x,
      y,
      w: ew,
      h: eh,
    }))
  const clicks = [
    ...el('a.cta', width === 390 ? 120 : 400, 380, width === 390 ? 760 : 200, 52, 240, 6),
    ...el('nav>a.pricing', width === 390 ? 700 : 560, 24, 90, 28, 120, 3),
    ...el('div.plan:2>a.buy', width === 390 ? 120 : 440, 1200, width === 390 ? 760 : 160, 48, 90, 4),
    ...el('footer>a.docs', 120, h - 120, 80, 24, 20, 2),
  ]
  const views = { 390: 310, 768: 90, 1280: 420 }[width]
  return {
    path: '/',
    width,
    widths: [
      { width: 390, views: 310 },
      { width: 768, views: 90 },
      { width: 1280, views: 420 },
    ],
    views,
    window: w,
    height: h,
    clicks,
    dead: el('div.plan:1', width === 390 ? 120 : 140, 1160, width === 390 ? 760 : 300, 220, 14, 1),
    rage: el('div.plan:1', width === 390 ? 120 : 140, 1160, width === 390 ? 760 : 300, 220, 5, 1),
    elements: [
      { el: 'a.cta', clicks: 240, dead: 0, rage: 0 },
      { el: 'nav>a.pricing', clicks: 120, dead: 0, rage: 0 },
      { el: 'div.plan:2>a.buy', clicks: 90, dead: 0, rage: 0 },
      { el: 'div.plan:1', clicks: 0, dead: 14, rage: 5 },
    ],
    fields: [
      { form: 'signup', field: 'email', reached: 120, left: 8 },
      { form: 'signup', field: 'company', reached: 96, left: 31 },
    ],
    scroll: [1, 0.96, 0.9, 0.82, 0.7, 0.55, 0.42, 0.3, 0.2, 0.12],
    scroll_views: views,
  }
}
