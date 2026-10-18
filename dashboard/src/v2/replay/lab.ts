// The replay lab: a prototype of two ways to tell a period as a short story, chosen with ?replay=story|clock on a
// development build. This file is the pure part: which moments the story stops at (real ones only, from the series and
// the report), how far the count has got, and how they are spaced. Pure: lab.test.ts.
import { copy } from './lab.copy'

export type LabMode = 'story' | 'clock'

/** A development build only; a production build never reads the address. */
export function labMode(): LabMode | null {
  if (!import.meta.env.DEV) return null
  const v = new URLSearchParams(location.search).get('replay')
  return v === 'story' || v === 'clock' ? v : null
}

/** A whole run takes this long. */
export const LAB_MS = 6800

export type CapKind = 'first' | 'jump' | 'sale' | 'best' | 'mention' | 'source' | 'down'

export interface Cap {
  /** How far along the line, 0 to 1. */
  pos: number
  /** When, as the readout writes it. */
  at: string
  line: string
  sub?: string
  kind: CapKind
}

/** Lower comes first when two are too close to both be told. */
const RANK: Record<CapKind, number> = { sale: 0, mention: 0, source: 1, down: 1, jump: 2, best: 3, first: 4 }
/** Two moments closer than this share of the run are one beat, and the more important is told. */
const GAP = 0.06
/** The story rests on each, so it tells fewer; the clock only flashes them. */
export const MAX_STORY = 5
const MAX = 6

/** The moments to tell, in the order the line meets them. */
export function pickCaps(all: Cap[], max = MAX): Cap[] {
  const kept: Cap[] = []
  for (const c of [...all].sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.pos - b.pos)) {
    if (kept.length < max && kept.every((k) => Math.abs(k.pos - c.pos) >= GAP)) kept.push(c)
  }
  return kept.sort((a, b) => a.pos - b.pos)
}

export interface SeriesIn {
  /** The people of each point the line is drawn through. */
  vals: number[]
  /** How each point is named: "14:00", "Oct 3". */
  stamp: (i: number) => string
  bucket: string
  /** The chart's own label over its biggest rise, and where it sits (an index into `vals`). */
  rise?: { i: number; text: string }
  /** The first sale on the line, where it sits (an index into `vals`) and its amount as written. */
  sale?: { i: number; text: string }
}

/** The moments the numbers themselves hold: the first visit of a day, the biggest jump, the busiest bucket, the first sale. */
export function seriesCaps(o: SeriesIn): Cap[] {
  const n = o.vals.length
  if (n < 3) return []
  const pos = (i: number) => i / (n - 1)
  const out: Cap[] = []
  const first = o.vals.findIndex((v) => v > 0)
  // "First visit" says something only for a day, whose hours begin empty.
  if (o.bucket === 'hour' && first >= 0) out.push({ pos: pos(first), at: o.stamp(first), line: copy.firstVisit, kind: 'first' })
  const peak = Math.max(...o.vals)
  let jump = 0
  for (let i = 1; i < n; i++) if (o.vals[i] - o.vals[i - 1] > o.vals[jump] - o.vals[Math.max(0, jump - 1)]) jump = i
  const rise = jump > 0 ? o.vals[jump] - o.vals[jump - 1] : 0
  if (o.rise) out.push({ pos: pos(o.rise.i), at: o.stamp(o.rise.i), line: o.rise.text, kind: 'jump' })
  else if (rise >= Math.max(3, peak * 0.2) && o.vals[jump] >= o.vals[jump - 1] * 1.5) out.push({ pos: pos(jump), at: o.stamp(jump), line: copy.jump(o.vals[jump - 1], o.vals[jump]), kind: 'jump' })
  const top = o.vals.indexOf(peak)
  if (peak > 0 && top >= 0) out.push({ pos: pos(top), at: o.stamp(top), line: copy.best(o.bucket, peak), kind: 'best' })
  if (o.sale) out.push({ pos: pos(o.sale.i), at: o.stamp(o.sale.i), line: copy.firstSale(o.sale.text), kind: 'sale' })
  return out
}

/** The running count at `p` along the line: the points' people added up as the line passes them, scaled so the last is the period's real total (a person seen in two points counts once). */
export function countAt(vals: number[], total: number, p: number): number {
  const n = vals.length
  const sum = vals.reduce((a, v) => a + v, 0)
  if (n < 2 || sum <= 0) return total
  const at = Math.min(n - 1, Math.max(0, p * (n - 1)))
  const i = Math.min(n - 2, Math.floor(at))
  let upto = 0
  for (let k = 0; k <= i; k++) upto += vals[k]
  return Math.min(total, Math.round(((upto + (at - i) * vals[i + 1]) / sum) * total))
}

/** "14:32" from minutes of the day. */
export const clockOf = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(Math.floor(min % 60)).padStart(2, '0')}`
