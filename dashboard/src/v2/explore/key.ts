// Two sets of filters are the same, whatever their order: this is what tells them apart.
import type { Filter } from '../../lib/api'

export const keyOf = (list: Filter[]): string =>
  list
    .map((f) => `${f.dim}=${f.value}`)
    .sort()
    .join('&')
