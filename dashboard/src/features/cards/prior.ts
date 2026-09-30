// What the period before had on a row, for the number the row shows.
import type { Result } from '../../lib/api'

/** `customers` for the money lists, visitors for the rest; undefined when the row was not there. */
export function priorOf(prev: Result | undefined, dim: string, byRevenue = false): (key: string) => number | undefined {
  return (key) => {
    if (!prev) return undefined
    if (byRevenue) return (prev.revenue_dims?.[dim] ?? []).find((r) => r.value === key)?.customers
    const rows = dim === 'goal' ? prev.goals : prev.dims[dim]
    return (rows ?? []).find((r) => r.value === key)?.visitors
  }
}
