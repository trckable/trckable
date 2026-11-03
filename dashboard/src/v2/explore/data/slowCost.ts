// What slow pages cost: each speed band's visits against the fast band's conversion. Pure: slowCost.test.ts.
import type { SlowBandReport, SlowCostReport } from '../../../lib/api'
import type { SlowCostModel, SlowCostRow } from '../types'

/** A band with fewer visits than this says nothing about how its visitors behave. */
export const MIN_BAND = 30
/** The figures are told per month. */
const MONTH = 30
/** How sure the fast band must be better: a z of 1.64 is one chance in twenty that it is luck. */
const SURE = 1.64

/** What a visit is counted for, by what the site has: sales, then goals, then reading on. */
function kindOf(r: SlowCostReport): SlowCostModel['kind'] {
  if (r.money && r.bands.some((b) => b.orders > 0)) return 'money'
  return r.bands.some((b) => b.goals > 0) ? 'goals' : 'engaged'
}

const COUNTED = { money: 'paid', goals: 'goals', engaged: 'engaged' } as const
const hits = (b: SlowBandReport, kind: SlowCostModel['kind']): number => b[COUNTED[kind]]

/** Two significant figures: an estimate does not claim the last digit. */
export function roughly(n: number): number {
  if (n < 10) return Math.round(n)
  const step = 10 ** (Math.floor(Math.log10(n)) - 1)
  return Math.round(n / step) * step
}

/** How many standard errors better the fast rate is than this band's; a pooled two-proportion test. */
function sureness(fast: SlowBandReport, b: SlowBandReport, kind: SlowCostModel['kind']): number {
  const f = hits(fast, kind) / fast.visits
  const s = hits(b, kind) / b.visits
  const pooled = (hits(fast, kind) + hits(b, kind)) / (fast.visits + b.visits)
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / fast.visits + 1 / b.visits))
  return se > 0 ? (f - s) / se : 0
}

/**
 * The cost of the slower bands against the fast one: visits x (the fast band's rate - this band's rate) x what a
 * conversion is worth, told for 30 days. A band, or the fast one, with too few visits is not compared, and neither
 * is one the fast band does not beat clearly. Null when no visit was measured at all.
 */
export function mapSlowCost(r: SlowCostReport | null): SlowCostModel | null {
  if (!r || r.bands.every((b) => b.visits === 0)) return null
  const kind = kindOf(r)
  const fast = r.bands.find((b) => b.band === 'fast')
  const orders = r.bands.reduce((n, b) => n + b.orders, 0)
  const order = kind === 'money' && orders > 0 ? r.bands.reduce((n, b) => n + b.revenue, 0) / orders : 1
  const scale = MONTH / Math.max(1, r.days)
  const rows: SlowCostRow[] = r.bands.map((b) => {
    const enough = b.visits >= MIN_BAND
    const rate = enough ? hits(b, kind) / b.visits : null
    let lost = 0
    if (fast && enough && fast.visits >= MIN_BAND && b.band !== 'fast' && sureness(fast, b, kind) >= SURE) {
      lost = b.visits * (hits(fast, kind) / fast.visits - hits(b, kind) / b.visits) * order * scale
    }
    return { band: b.band, visits: b.visits, rate, lost: roughly(lost), pages: b.pages ?? [] }
  })
  const lost = rows.reduce((n, x) => n + x.lost, 0)
  // Under one whole unit (a dollar, a visit) there is nothing to say.
  const unit = kind === 'money' ? 10 ** (r.exponent ?? 2) : 1
  const slow = rows.find((x) => x.band === 'slow')?.lost ?? 0
  return { kind, verdict: lost >= unit ? 'loss' : 'few', lost, mostSlow: slow / Math.max(1, lost) > 0.5, rows }
}
