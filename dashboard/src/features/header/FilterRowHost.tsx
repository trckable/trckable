// FilterRow's way in: nothing at all when there are no filters and no saved
// views, else its own chunk (most visits have neither, so none of it is in
// the first load).
import { lazy, Suspense } from 'react'
import { isShared } from '../../lib/me'
import type { FilterRowProps } from './FilterRow'

const FilterRow = lazy(() => import('./FilterRow'))

export function FilterRowHost(p: FilterRowProps) {
  if (p.filters.length === 0 && (isShared() || !p.views || p.views.list.length === 0)) return null
  return (
    <Suspense fallback={null}>
      <FilterRow {...p} />
    </Suspense>
  )
}
