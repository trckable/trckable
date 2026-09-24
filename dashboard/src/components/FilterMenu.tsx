// A Filter button, for the times you know what you are looking for but it is
// not on the page. The menu (FilterPop.tsx) is its own chunk: its icons and
// search cost nothing until somebody opens it.
import { ListFilter } from 'lucide-react'
import { lazy, Suspense, useRef, useState } from 'react'
import type { Row } from '../lib/api'

const FilterPop = lazy(() => import('./FilterPop'))

export function FilterMenu(p: {
  rows: (dim: string) => Row[]
  labelFor: (dim: string, value: string) => string
  active: { dim: string; value: string }[]
  onPick: (dim: string, value: string) => void
  onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  return (
    <div ref={root} style={{ position: 'relative' }}>
      <button
        type="button"
        className={p.active.length ? 'btn filter on' : 'btn filter'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <ListFilter size={17} strokeWidth={1.75} aria-hidden="true" />
        Filter
        {p.active.length > 0 && <span className="filter-count num">{p.active.length}</span>}
      </button>
      {open && (
        <Suspense fallback={null}>
          <FilterPop {...p} root={root} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </div>
  )
}
