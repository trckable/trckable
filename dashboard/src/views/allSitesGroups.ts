// The groups of All sites: the switcher's groups (features/sites/layout.ts,
// shared by the whole account), each with its sites, then the rest.
import type { SiteLayout, SiteRow } from '../lib/api'
import { hasPayments } from './allSitesLogic'

export interface Block {
  /** The group's name; null for the sites in no group. */
  name: string | null
  rows: SiteRow[]
}

/** The rows by group, in the order they come in. Empty groups stay (a new group is empty until a site is moved in) unless `searching`. */
export function blocksOf(rows: SiteRow[], layout: SiteLayout, searching: boolean): Block[] {
  const grouped = new Set(layout.groups.flatMap((g) => g.sites))
  const blocks: Block[] = layout.groups.map((g) => ({ name: g.name, rows: rows.filter((r) => g.sites.includes(r.id)) }))
  blocks.push({ name: null, rows: rows.filter((r) => !grouped.has(r.id)) })
  return blocks.filter((b) => !searching || b.rows.length > 0).filter((b) => b.name !== null || b.rows.length > 0)
}

/** A block's totals: the visitors, and the revenue when every paying site there earns in one currency. */
export function totalsOf(rows: SiteRow[]) {
  const paying = rows.filter(hasPayments)
  const currencies = new Set(paying.map((r) => r.currency))
  const revenue = paying.reduce((a, r) => a + (r.revenue ?? 0), 0)
  const one = paying[0]
  return {
    visitors: rows.reduce((a, r) => a + r.visitors, 0),
    money: currencies.size === 1 && revenue > 0 ? { amount: revenue, currency: one.currency, exponent: one.exponent } : null,
  }
}
