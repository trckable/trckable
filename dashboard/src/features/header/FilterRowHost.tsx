// FilterRow's way in: its own chunk, fetched only when there are filters or
// saved views (most visits have neither, so none of it is in the first load).
import { lazy, Suspense } from 'react'
import type { FilterRowProps } from './FilterRow'

const FilterRow = lazy(() => import('./FilterRow'))

export function FilterRowHost(p: FilterRowProps) {
  return (
    <Suspense fallback={null}>
      <FilterRow {...p} />
    </Suspense>
  )
}
