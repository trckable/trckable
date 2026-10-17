// What Explore tells a number against: the Briefing's usual for one whole site's single day, else the period the
// address asked to compare with. The usual is the whole site's own past, so a narrowed view (a filter) cannot use it.
// Pure: basis.test.ts.
import type { Filter } from '../../../lib/api'
import type { CompareMode, Range } from '../../../lib/dates'

export type Basis = 'usual' | 'previous' | 'year' | 'custom'

export function basisOf(o: { range: Range; filters: Filter[]; compare: CompareMode }): Basis {
  if (o.compare === 'year') return 'year'
  if (o.compare === 'custom') return 'custom'
  return o.range.from === o.range.to && o.filters.length === 0 ? 'usual' : 'previous'
}
