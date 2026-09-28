// The period's moments, placed on the chart: each at its bucket's index,
// grouped, with the neighbours ← and → jump to. Pure, so tests read it.
import type { Bucket } from '../../lib/api'
import { bucketLabel } from '../../charts/timeScale'
import { fmtDay } from '../../lib/dates'
import { copy } from './copy'

export type MomentKind = 'spike' | 'sale' | 'country' | 'ai' | 'milestone' | 'note'

export interface Moment {
  t: string
  kind: MomentKind
  factor?: number
  referrer?: string
  count?: number
  amount?: number
  channel?: string
  country?: string
  bot?: string
  step?: string
  family?: string
  value?: number
  currency?: string
  text?: string
}

export interface Placed {
  i: number
  moments: Moment[]
}

/** Money moments exist only where the viewer may see revenue. */
const MONEY: MomentKind[] = ['sale']
const moneyFamily = (m: Moment) => m.kind === 'milestone' && (m.family === 'revenue' || m.family === 'first_sale')

/** Each moment at its bucket on the chart (labels are the chart's own
 *  bucket keys); the ones outside it are left out. */
export function place(list: Moment[], labels: string[], money: boolean): Placed[] {
  const at = new Map(labels.map((t, i) => [t.slice(0, 16), i]))
  const byI = new Map<number, Moment[]>()
  for (const m of list) {
    if (!money && (MONEY.includes(m.kind) || moneyFamily(m))) continue
    const i = at.get(m.t.slice(0, 16))
    if (i === undefined) continue
    byI.set(i, [...(byI.get(i) ?? []), m])
  }
  return [...byI].map(([i, moments]) => ({ i, moments })).sort((a, b) => a.i - b.i)
}

/** The moment after (dir 1) or before (dir -1) the playhead, if any. */
export function neighbour(placed: Placed[], at: number, dir: 1 | -1): number | null {
  if (dir > 0) return placed.find((p) => p.i > at)?.i ?? null
  for (let k = placed.length - 1; k >= 0; k--) if (placed[k].i < at) return placed[k].i
  return null
}

/** The busiest bucket's label: "20:00" by the hour, "Sep 27" by the day. */
export function best(labels: string[], values: number[], bucket: Bucket): string {
  let top = -1
  values.forEach((v, i) => {
    if (v > 0 && (top < 0 || v > values[top])) top = i
  })
  if (top < 0) return ''
  return bucket === 'hour' ? labels[top].slice(11, 16) : bucketLabel(labels[top], bucket)
}

/** The card's one line: "Sep 27–28: 1,487 visitors, best hour 20:00, top
 *  source Google, 2 sales" (the sales only when they may be shown). */
export function summaryLine(s: { period: string; visitors: string; best: string; bucket: Bucket; source?: string; sales?: number }): string {
  const parts = [copy.visitors(s.visitors)]
  if (s.best) parts.push(s.bucket === 'hour' ? copy.bestHour(s.best) : copy.bestDay(s.best))
  if (s.source) parts.push(copy.topSource(s.source))
  if (s.sales) parts.push(copy.sales(s.sales))
  return `${s.period}: ${parts.join(', ')}`
}

/** How many payments the period's sale moments hold. */
export const salesIn = (placed: Placed[]) => placed.reduce((n, p) => n + p.moments.reduce((k, m) => k + (m.kind === 'sale' ? (m.count ?? 0) : 0), 0), 0)

/** "Sep 27–28", or one day alone. */
export function periodOf([from, to]: [string, string]) {
  if (from === to) return fmtDay(from)
  const [a, b] = [fmtDay(from), fmtDay(to)]
  return a.slice(0, 3) === b.slice(0, 3) ? `${a}–${b.slice(4)}` : `${a} – ${b}`
}
