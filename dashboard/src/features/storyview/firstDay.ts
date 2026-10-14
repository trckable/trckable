// The site's first day with a visit, as far as the report can tell: the first
// day of visitors in the earlier period, else in this one. A site added before
// the report starts is told from the day it was added, so a short range on an
// old site never reads as a new one. Pure: firstDay.test.ts.
import type { Result } from '../../lib/api'

const dayOf = (r: Result | undefined) => r?.series.find((x) => x.visitors > 0)?.t.slice(0, 10)

/** `added` is the day the site was added, in its timezone, when known. */
export function firstDayOf(cur: Result, prev: Result | undefined, added?: string): string | undefined {
  const seen = dayOf(prev) ?? dayOf(cur)
  const start = (prev ?? cur).series[0]?.t.slice(0, 10)
  if (added && start && added < start) return added
  return seen && added && seen < added ? added : seen
}
