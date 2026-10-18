// The period's moments, placed on the chart: each at its bucket's index,
// grouped. Pure, so tests read it.
import type { Bucket } from '../../lib/api'
import { bucketLabel } from '../../charts/timeScale'
import { fmtDay } from '../../lib/dates'

export type SaleWhat = 'new' | 'upgrade' | 'renewal' | 'sale'
export type MomentKind = 'spike' | 'surge' | 'mention' | 'sale' | 'country' | 'ai' | 'milestone' | 'note'

export interface Moment {
  t: string
  kind: MomentKind
  factor?: number
  referrer?: string
  visitors?: number
  count?: number
  amount?: number
  channel?: string
  /** A sale's kind, when all its payments were the same. */
  what?: SaleWhat
  country?: string
  bot?: string
  step?: string
  family?: string
  value?: number
  currency?: string
  text?: string
  /** Where it was posted (hn, ph, news): a mention, or a spike one explains. */
  mention?: string
  /** The visitors that mention brought. */
  brought?: number
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

/** The busiest bucket's label: "20:00" by the hour, "Sep 27" by the day. */
export function best(labels: string[], values: number[], bucket: Bucket): string {
  let top = -1
  values.forEach((v, i) => {
    if (v > 0 && (top < 0 || v > values[top])) top = i
  })
  if (top < 0) return ''
  return bucket === 'hour' ? labels[top].slice(11, 16) : bucketLabel(labels[top], bucket)
}

/** "Sep 27–28", or one day alone. */
export function periodOf([from, to]: [string, string]) {
  if (from === to) return fmtDay(from)
  const [a, b] = [fmtDay(from), fmtDay(to)]
  return a.slice(0, 3) === b.slice(0, 3) ? `${a}–${b.slice(4)}` : `${a} – ${b}`
}
