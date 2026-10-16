// The filters of Explore: one value for each of four things, or for any other thing a row stands for. Pure.
import type { Filter } from '../../lib/api'
import { DIM_LABEL } from '../../features/overview/dimLabels'
import { countryName } from '../../lib/format'
import { copy } from './copy'
import type { FilterDim, Option } from './types'

export const dimWord = (dim: string): string => (copy.dims as Record<string, string>)[dim] ?? DIM_LABEL[dim] ?? dim

/** What a chip says for a filter: the short name of the value where it has one, its readable name otherwise. */
export function chipName(f: Filter, options: Partial<Record<FilterDim, Option[]>>): string {
  const o = options[f.dim as FilterDim]?.find((x) => x.val === f.value)
  if (o) return o.short ?? o.name
  return f.dim === 'country' ? countryName(f.value) : f.value
}

/** The filter set with this value on, or off when it is the one already on: one value to a dimension. */
export function toggled(list: Filter[], dim: string, value: string): Filter[] {
  const same = list.some((f) => f.dim === dim && f.value === value)
  const rest = list.filter((f) => f.dim !== dim)
  return same ? rest : [...rest, { dim, value }]
}

export const withValue = (list: Filter[], dim: string, value: string): Filter[] => [...list.filter((f) => f.dim !== dim), { dim, value }]

export const without = (list: Filter[], dim: string): Filter[] => list.filter((f) => f.dim !== dim)

export const valueOf = (list: Filter[], dim: string | undefined): string | null => (dim ? (list.find((f) => f.dim === dim)?.value ?? null) : null)

/** A name for a set of filters, as a saved view is called. */
export const nameOf = (list: Filter[], options: Partial<Record<FilterDim, Option[]>>): string => list.map((f) => chipName(f, options)).join(' · ')

export { keyOf } from './key'
