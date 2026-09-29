// A Filter button, for the times you know what you are looking for but it is
// not on the page. The menu (FilterPop.tsx) is its own chunk: its icons and
// search cost nothing until somebody opens it.
import { ListFilter } from 'lucide-react'
import { lazy, Suspense, useRef, useState } from 'react'
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
  /** In the phone's sheet: an Add button, the count is the sheet's own. */
  add?: boolean
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const label = p.add ? copy.add : copy.filter
  return (
    <div ref={root} className="filter-root">
      <button
        type="button"
        className={p.active.length && !p.add ? 'btn ghost filter on' : 'btn ghost filter'}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {!p.add && <ListFilter size={17} strokeWidth={1.75} aria-hidden="true" />}
        <span className="filter-label">{label}</span>
        {p.active.length > 0 && !p.add && <span className="filter-count num">{p.active.length}</span>}
      </button>
      {open && (
        <Suspense fallback={null}>
          <FilterPop {...p} root={root} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </div>
  )
}
