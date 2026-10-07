// The rules of the All sites screen, apart from how it looks: where the charts
// start, how rows sort, what a site's revenue and bounce say, who is online.
import type { SiteRow } from '../lib/api'

/** A bounce rate from here on is high: 3 in 4 leave after one page. */
export const HIGH_BOUNCE = 0.75

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

/** The bounce rate is high enough to flag. */
export const bounceHigh = (rate: number, visitors = 1) => visitors > 0 && rate >= HIGH_BOUNCE

/** The rate in tenths, for "8 in 10 leave after one page". */
export const bounceTenths = (rate: number) => Math.round(rate * 10)

/** Revenue is connected when the site reports it, even if it is zero. */
export const hasPayments = (r: SiteRow) => r.revenue !== undefined

/** The Revenue column shows only when some shown site has payments connected. */
export const anyPayments = (rows: SiteRow[]) => rows.some(hasPayments)

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

/** The online line of a row: a number with a dot, or none. */
export const onlineOf = (r: SiteRow): number => (r.error ? 0 : r.online)

/** Up to this many sites shown, each is a card; beyond it, a slim list. */
export const CARDS_MAX = 8

export type Layout = 'cards' | 'list'

const VIEW_KEY = 'tkb_all_view'

/** The viewer's picked view, or null (automatic) until one is picked. */
export function savedView(): Layout | null {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    return v === 'cards' || v === 'list' ? v : null
  } catch {
    return null
  }
}

export function saveView(v: Layout) {
  try {
    localStorage.setItem(VIEW_KEY, v)
  } catch {
    // not remembered; it still applies now
  }
}

/** ?layout=cards or ?layout=list wins (to look at both), then the viewer's pick, then by site count. */
export function layoutOf(count: number, override?: string | null, picked?: Layout | null): Layout {
  if (override === 'cards' || override === 'list') return override
  if (picked) return picked
  return count <= CARDS_MAX ? 'cards' : 'list'
}

/** The numbers over the shown sites: totals, the visitor-weighted bounce rate and who has payments. */
export function summarize(list: SiteRow[]) {
  const total = list.reduce((a, r) => a + r.visitors, 0)
  const bounce = total ? list.reduce((a, r) => a + r.bounce_rate * r.visitors, 0) / total : 0
  return {
    total,
    previous: list.reduce((a, r) => a + r.previous_visitors, 0),
    pageviews: list.reduce((a, r) => a + r.pageviews, 0),
    bounce,
    paying: list.filter(hasPayments),
  }
}
