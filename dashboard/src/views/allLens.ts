// The lens of All sites: the same page seen as Visitors or Revenue. A lens
// changes the numbers on the page, never its layout. Revenue is only what the
// sites were paid in the period; nothing is estimated.
import type { SiteRow } from '../lib/api'
import { fmtInt, fmtMoney } from '../lib/format'
import { type Item } from './allNext'
import { next } from './allNextCopy'

export type Lens = 'visitors' | 'revenue'
export const LENSES: Lens[] = ['visitors', 'revenue']

/** What one site shows under the lens: the number, its unit, a line, and its share of the revenue. */
export interface Cell {
  main: string
  unit: string
  note: string
  /** Its share of the revenue, 0 to 100; null when it has none or the currencies differ. */
  share: number | null
}

const name = (r: SiteRow) => r.name || r.domain
const paid = (r: SiteRow) => r.revenue !== undefined && !r.error

/** The revenue of the rows added up, or 0 when it is in more than one currency (a sum of those means nothing). */
export function revenueTotal(rows: SiteRow[]): number {
  const paying = rows.filter(paid)
  return new Set(paying.map((r) => r.currency)).size > 1 ? 0 : paying.reduce((n, r) => n + (r.revenue ?? 0), 0)
}

export function cellOf(lens: Lens, i: Item, total: number): Cell {
  const r = i.row
  if (lens === 'visitors') return { main: fmtInt(i.today), unit: next.todayWord, note: '', share: null }
  if (!paid(r)) return { main: '–', unit: '', note: next.noPayments, share: null }
  const share = total > 0 ? ((r.revenue ?? 0) / total) * 100 : null
  return { main: fmtMoney(r.revenue ?? 0, r.currency, r.exponent, { cents: false }), unit: '', note: share === null ? '' : next.shareOf(fmtInt(share)), share }
}

const payingCount = (list: Item[]) => list.filter((i) => paid(i.row) && (i.row.revenue ?? 0) > 0).length

/** The site with the most revenue, when the sum means something. */
function lead(list: Item[], total: number): Item | undefined {
  if (total <= 0) return undefined
  return [...list].filter((i) => (i.row.revenue ?? 0) > 0).sort((a, b) => (b.row.revenue ?? 0) - (a.row.revenue ?? 0))[0]
}

/** The one line over the page for the Revenue lens. */
export function revenueHeadline(list: Item[], money: string): string {
  const top = lead(list, revenueTotal(list.map((i) => i.row)))
  return next.revenueLine(money, payingCount(list), top ? name(top.row) : '')
}

/** The three figures over the page for the Revenue lens. */
export function revenueStrip(list: Item[], money: string): { label: string; value: string }[] {
  const sum = revenueTotal(list.map((i) => i.row))
  const top = lead(list, sum)
  return [
    { label: next.stripRevenue, value: money },
    { label: next.stripPaying, value: String(payingCount(list)) },
    { label: next.stripTop, value: top ? `${name(top.row)} · ${fmtInt(((top.row.revenue ?? 0) / sum) * 100)}%` : '–' },
  ]
}
