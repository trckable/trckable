// A report's earlier period with every count of people multiplied by one factor, so a whole day can stand for the part of
// a day that has happened. Pure: scaled.test.ts.
import type { Result, Row } from '../../../lib/api'

const rows = (r: Row[] | null | undefined, k: number): Row[] | null => (r ? r.map((x) => ({ ...x, visitors: Math.round(x.visitors * k) })) : null)

/** `revenue`: what the same hours usually earn, when the history says (sales are not a share of the people). */
export function scaled(r: Result, k: number, revenue?: number): Result {
  const dims: Result['dims'] = {}
  for (const [name, list] of Object.entries(r.dims)) dims[name] = rows(list, k)
  return {
    ...r,
    kpis: { ...r.kpis, visitors: Math.round(r.kpis.visitors * k), sessions: Math.round(r.kpis.sessions * k), pageviews: Math.round(r.kpis.pageviews * k) },
    dims,
    goals: rows(r.goals, k),
    money: r.money ? { ...r.money, revenue: revenue ? Math.round(revenue) : Math.round(r.money.revenue * k) } : r.money,
  }
}
