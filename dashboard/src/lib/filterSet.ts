// Filters as the address writes them and as a chip says them. A filter is one
// value of one dimension, "is" or "is not"; the values of one dimension and
// one op together are a set ("Country is DE or AT"): any of them. Everything
// that reads or writes a filter does it here, so the address, a saved view,
// the chips, the API and the export all say the same thing.
import type { Filter } from './api'

/** The server takes this many values per dimension. */
export const MAX_VALUES = 20

export interface FilterSet {
  dim: string
  op: 'is' | 'not'
  values: string[]
}

export const opOf = (f: Filter): 'is' | 'not' => (f.op === 'not' ? 'not' : 'is')

export const sameFilter = (a: Filter, b: Filter): boolean => a.dim === b.dim && a.value === b.value && opOf(a) === opOf(b)

/** "country:DE" for is, "country!:US" for is not: the f= parameter. */
export function filterParam(f: Filter): string {
  return `${f.dim}${opOf(f) === 'not' ? '!' : ''}:${f.value}`
}

/** The filter an f= parameter names; null when it names none. Addresses from
 *  before "is not" have no "!" and mean what they always meant. */
export function parseFilterParam(raw: string): Filter | null {
  const i = raw.indexOf(':')
  if (i <= 0) return null
  const head = raw.slice(0, i)
  const value = raw.slice(i + 1)
  if (!head.endsWith('!')) return { dim: head, value }
  const dim = head.slice(0, -1)
  return dim ? { dim, op: 'not', value } : null
}

/** One set per dimension and op, in the order they first appear. */
export function setsOf(filters: Filter[]): FilterSet[] {
  const out: FilterSet[] = []
  for (const f of filters) {
    const op = opOf(f)
    const set = out.find((s) => s.dim === f.dim && s.op === op)
    if (!set) out.push({ dim: f.dim, op, values: [f.value] })
    else if (!set.values.includes(f.value)) set.values.push(f.value)
  }
  return out
}

export const filtersOf = (sets: FilterSet[]): Filter[] => sets.flatMap((s) => s.values.map((value): Filter => (s.op === 'not' ? { dim: s.dim, op: 'not', value } : { dim: s.dim, value })))

/** Adds a value from the Filter menu: it joins what the dimension already
 *  says (any of), and takes its op; a dimension with both says "is". Nothing
 *  happens past the server's limit. */
export function withValue(filters: Filter[], dim: string, value: string): Filter[] {
  if (filters.some((f) => f.dim === dim && f.value === value)) return filters
  const mine = setsOf(filters).filter((s) => s.dim === dim)
  if (mine.reduce((n, s) => n + s.values.length, 0) >= MAX_VALUES) return filters
  const op = mine.length === 1 ? mine[0].op : 'is'
  return [...filters, op === 'not' ? { dim, op, value } : { dim, value }]
}

/** Takes one value off, whichever op it was under. */
export const withoutValue = (filters: Filter[], dim: string, value: string): Filter[] => filters.filter((f) => !(f.dim === dim && f.value === value))

export const hasValue = (filters: Filter[], dim: string, value: string): boolean => filters.some((f) => f.dim === dim && f.value === value)

/** Takes a whole set off (a chip's ×). */
export const withoutSet = (filters: Filter[], set: FilterSet): Filter[] => filters.filter((f) => !(f.dim === set.dim && opOf(f) === set.op))

/** Turns a set's "is" into "is not", or back: its values stay. */
export function flipped(filters: Filter[], set: FilterSet): Filter[] {
  const op = set.op === 'is' ? 'not' : 'is'
  return filters.map((f) => {
    if (f.dim !== set.dim || opOf(f) !== set.op) return f
    return op === 'not' ? { dim: f.dim, op, value: f.value } : { dim: f.dim, value: f.value }
  })
}

export const hasDim = (filters: Filter[], dim: string): boolean => filters.some((f) => f.dim === dim)
