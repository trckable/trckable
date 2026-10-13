// The rules of the All sites screen, apart from how it looks: where the charts
// start, how sites sort and what a site's revenue says.
import type { SiteRow } from '../lib/api'

/** The first point of the shared x range: the earliest day with a visit on any shown site, 0 when the data covers the whole period. */
export function startIndex(rows: SiteRow[]): number {
  let first = Infinity
  for (const r of rows) {
    const i = r.series?.findIndex((v) => v > 0) ?? -1
    if (i >= 0) first = Math.min(first, i)
  }
  return Number.isFinite(first) ? first : 0
}

/** A series from the shared start on, so every chart and sparkline covers the same days. */
export const fromStart = (values: number[] | null, start: number): number[] => (values ?? []).slice(start)

/** Revenue is connected when the site reports it, even if it is zero. */
export const hasPayments = (r: SiteRow) => r.revenue !== undefined

export type OrderKey = 'order' | 'visitors' | 'name'
export const ORDERS: OrderKey[] = ['order', 'visitors', 'name']

/** Sorts a list by the viewer's choice; the switcher order comes in as a rank. */
export function sortBy(list: SiteRow[], key: OrderKey, rank: Map<string, number>): SiteRow[] {
  const byName = (a: SiteRow, b: SiteRow) => (a.name || a.domain).localeCompare(b.name || b.domain)
  const cmp = {
    order: (a: SiteRow, b: SiteRow) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0),
    visitors: (a: SiteRow, b: SiteRow) => b.visitors - a.visitors || byName(a, b),
    name: byName,
  }[key]
  return [...list].sort(cmp)
}

const KEY = 'tkb_all_order'

/** The viewer's saved sort, the switcher order until one is picked. */
export function savedOrder(): OrderKey {
  try {
    const v = localStorage.getItem(KEY) as OrderKey | null
    return v && ORDERS.includes(v) ? v : 'order'
  } catch {
    return 'order'
  }
}

export function saveOrder(k: OrderKey) {
  try {
    localStorage.setItem(KEY, k)
  } catch {
    // not remembered; it still applies now
  }
}
