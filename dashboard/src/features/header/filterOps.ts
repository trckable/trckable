// What the Filter menu and the chips do to the address: add a value (any of),
// take one off, turn a chip's "is" into "is not", clear a chip. Each reads the
// filters from the address as it is when pressed, so a press never works from
// a page a moment old.
import { cachedReport, type Filter, type ReportQuery, type Row } from '../../lib/api'
import { flipped, setsOf, withoutSet, withoutValue, withValue, type FilterSet } from '../../lib/filterSet'
import { readView, setView } from '../../lib/url'
import { DIM_LABEL } from '../overview/dimLabels'
import { setWords } from './setWords'

const now = (): Filter[] => readView(new URLSearchParams(location.search)).filters

export const filterOps = {
  /** From the Filter menu: joins the dimension's values. */
  pick: (dim: string, value: string) => setView({ filters: withValue(now(), dim, value), day: undefined }),
  dropValue: (f: Filter) => setView({ filters: withoutValue(now(), f.dim, f.value) }),
  dropSet: (set: FilterSet) => setView({ filters: withoutSet(now(), set) }),
  flip: (set: FilterSet) => setView({ filters: flipped(now(), set) }),
}

/** The chips as the phone's sheet and the row's count read them: what each says, and what it does. */
export const activeChips = (filters: Filter[], valueLabel: (dim: string, value: string) => string) =>
  setsOf(filters).map((set) => ({ key: set.dim + set.op, ...setWords(set, (dim) => DIM_LABEL[dim] ?? dim, valueLabel), flip: () => filterOps.flip(set), remove: () => filterOps.dropSet(set) }))

/** The rows of a filtered dimension without its own filters: what a second value can be picked from. */
export const siblingRows = (site: string, query: ReportQuery) => async (dim: string): Promise<Row[]> => {
  const without = (query.filters ?? []).filter((f) => f.dim !== dim)
  const r = await cachedReport(site, { ...query, compare: undefined, daily: false, filters: without })
  return (dim === 'goal' ? r.current.goals : r.current.dims?.[dim]) ?? []
}
