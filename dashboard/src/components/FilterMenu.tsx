// A Filter button, for the times you know what you are looking for but it is
// not on the page. The menu (FilterPop.tsx) is its own chunk: its icons and
// search cost nothing until somebody opens it.
import { ListFilter } from 'lucide-react'
import { lazy, Suspense, useRef } from 'react'
import { closer, filterMenu, toggler } from './panelOpen'
import type { Row } from '../lib/api'
import { copy } from '../features/header/copy'

const FilterPop = lazy(() => import('./FilterPop'))

export function FilterMenu(p: {
  rows: (dim: string) => Row[]
  labelFor: (dim: string, value: string) => string
  active: { dim: string; value: string }[]
  onPick: (dim: string, value: string) => void
  onRemove: (f: { dim: string; value: string }) => void
  onClear: () => void
}) {
  const open = filterMenu.use()
  const setOpen = filterMenu.set
  const root = useRef<HTMLDivElement>(null)
  const menu = open && (
    <Suspense fallback={null}>
      <FilterPop {...p} root={root} onClose={closer(setOpen)} />
    </Suspense>
  )
  return (
    <div ref={root} className="filter-root">
      <button
        type="button"
        className={p.active.length ? 'btn ghost filter on' : 'btn ghost filter'}
        title={copy.filter}
        data-key="filter"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggler(setOpen, open)}
      >
        <ListFilter size={17} strokeWidth={1.75} aria-hidden="true" />
        <span className="filter-label">{copy.filter}</span>
        {p.active.length > 0 && <span className="filter-count num">{p.active.length}</span>}
      </button>
      {menu}
    </div>
  )
}
