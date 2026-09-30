// The chart kit's arithmetic: axes, stacks, heat levels and the page-flow
// layout. No React, no DOM, so every chart's shape is tested on its own
// (scale.test.ts) and the components only draw what these return.

/** A round axis: step from 1/2/2.5/5 × 10^k with at most `lines` gridlines. */
export function niceScale(v: number, lines = 4): { max: number; step: number; ticks: number[] } {
  const top = Math.max(lines, v)
  const pow = Math.pow(10, Math.floor(Math.log10(top / lines)))
  let step = top / lines
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (Math.ceil(top / (m * pow)) <= lines) {
      step = m * pow
      break
    }
  }
  const n = Math.ceil(top / step)
  const ticks = Array.from({ length: n + 1 }, (_, i) => i * step)
  return { max: n * step, step, ticks }
}

/** Running totals per index: bands[i] sits on top of bands[i-1]. */
export function stack(bands: number[][]): { y0: number[]; y1: number[] }[] {
  const n = bands[0]?.length ?? 0
  const base = new Array<number>(n).fill(0)
  return bands.map((b) => {
    const y0 = base.slice()
    for (let i = 0; i < n; i++) base[i] += b[i] ?? 0
    return { y0, y1: base.slice() }
  })
}

/** The tallest total of any index across stacked bands. */
export function stackPeak(bands: number[][]): number {
  const n = bands[0]?.length ?? 0
  let peak = 0
  for (let i = 0; i < n; i++) {
    let sum = 0
    for (const b of bands) sum += b[i] ?? 0
    peak = Math.max(peak, sum)
  }
  return peak
}

/** A heat level from 0 (none) to `levels`: square root, so a quiet hour is
 *  still visible next to the busiest one. */
export function heatLevel(n: number, peak: number, levels = 4): number {
  if (!n || !peak) return 0
  return Math.max(1, Math.min(levels, Math.ceil(Math.sqrt(n / peak) * levels)))
}

/** Index of the bucket nearest to x, for a chart `width` wide with `n` points. */
export function nearestIndex(x: number, width: number, n: number): number {
  if (n <= 1 || width <= 0) return 0
  return Math.max(0, Math.min(n - 1, Math.round((x / width) * (n - 1))))
}

/** Which few labels an axis can show without crowding: first, last and
 *  evenly spaced ones between. */
export function tickIndexes(n: number, max = 4): number[] {
  if (n <= 0) return []
  if (n <= max) return Array.from({ length: n }, (_, i) => i)
  const out = new Set<number>()
  for (let i = 0; i < max; i++) out.add(Math.round((i * (n - 1)) / (max - 1)))
  return [...out]
}

/** How an x-axis label lines up: the ends hug the edges, the rest centre. */
export function anchorOf(i: number, n: number): 'start' | 'middle' | 'end' {
  if (i === 0) return 'start'
  if (i === n - 1) return 'end'
  return 'middle'
}

/** A box in a flow column: y and height in the chart's units. */
export interface FlowBox {
  col: number
  key: string
  value: number
  y: number
  h: number
}

/** A node to lay out: `weight` is the height it takes when that should be less than its visits (a capped catch-all). */
export interface FlowIn {
  key: string
  value: number
  weight?: number
}

/** A band between two boxes, with where it leaves and where it arrives. */
export interface FlowBand {
  from: FlowBox
  to: FlowBox
  value: number
  y0: number // top at the source
  y1: number // top at the target
  h0: number
  h1: number
}

/**
 * Lays out a flow: every column scaled to the visits of the first one, boxes
 * stacked with a gap, and each link a band leaving its source in order and
 * arriving at its target in order, so bands never cross inside a box.
 */
export function flowLayout(
  cols: FlowIn[][],
  links: { col: number; from: string; to: string; value: number }[],
  height: number,
  gap = 6,
): { boxes: FlowBox[]; bands: FlowBand[] } {
  const size = (b: FlowIn) => b.weight ?? b.value
  const total = Math.max(1, ...cols.map((c) => c.reduce((s, b) => s + size(b), 0)))
  const most = Math.max(1, ...cols.map((c) => c.length))
  const k = Math.max(0, height - gap * (most - 1)) / total
  const boxes: FlowBox[] = []
  const at = new Map<string, FlowBox>()
  cols.forEach((col, c) => {
    let y = 0
    for (const b of col) {
      const box = { col: c, key: b.key, value: b.value, y, h: Math.max(1, size(b) * k) }
      boxes.push(box)
      at.set(`${c}|${b.key}`, box)
      y += box.h + gap
    }
  })
  const out = new Map<FlowBox, number>()
  const inn = new Map<FlowBox, number>()
  const bands: FlowBand[] = []
  for (const l of links) {
    const from = at.get(`${l.col}|${l.from}`)
    const to = at.get(`${l.col + 1}|${l.to}`)
    if (!from || !to) continue
    const h0 = (l.value / Math.max(1, from.value)) * from.h
    const h1 = (l.value / Math.max(1, to.value)) * to.h
    const y0 = from.y + (out.get(from) ?? 0)
    const y1 = to.y + (inn.get(to) ?? 0)
    out.set(from, (out.get(from) ?? 0) + h0)
    inn.set(to, (inn.get(to) ?? 0) + h1)
    bands.push({ from, to, value: l.value, y0, y1, h0, h1 })
  }
  return { boxes, bands }
}
