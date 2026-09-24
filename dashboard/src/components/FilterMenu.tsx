// A Filter button, for the times you know what you are looking for but it is
// not on the page. Clicking a row is still the fast way in; this is the way
// in when the row you want is the four hundredth.
//
// Values come from the report that is already loaded, so opening this costs
// nothing and asks the server nothing. A dimension the current report does
// not carry — regions and cities in Core — says so rather than looking empty.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Row } from '../lib/api'

export type FilterGroup = {
  name: string
  dims: { dim: string; label: string; note?: string }[]
}

// Grouped the way somebody thinks about a visit: where they came from, what
// they read, who they are, what they did.
export const FILTER_GROUPS: FilterGroup[] = [
  {
    name: 'Acquisition',
    dims: [
      { dim: 'channel', label: 'Channel' },
      { dim: 'referrer', label: 'Referrer' },
      { dim: 'campaign', label: 'Campaign' },
      { dim: 'source', label: 'utm_source', note: 'Full mode' },
      { dim: 'medium', label: 'utm_medium', note: 'Full mode' },
    ],
  },
  {
    name: 'Content',
    dims: [
      { dim: 'entry_page', label: 'Entry page' },
      { dim: 'page', label: 'Page' },
      { dim: 'exit_page', label: 'Exit page', note: 'Full mode' },
      { dim: 'group', label: 'Section', note: 'None yet' },
    ],
  },
  {
    name: 'Location',
    dims: [
      { dim: 'country', label: 'Country' },
      { dim: 'region', label: 'Region', note: 'Full mode' },
      { dim: 'city', label: 'City', note: 'Full mode' },
    ],
  },
  {
    name: 'Device',
    dims: [
      { dim: 'device', label: 'Device' },
      { dim: 'browser', label: 'Browser' },
      { dim: 'os', label: 'OS' },
      { dim: 'language', label: 'Language', note: 'Full mode' },
    ],
  },
  { name: 'Behaviour', dims: [{ dim: 'goal', label: 'Goal', note: 'None yet' }] },
]

export function FilterMenu({
  rows,
  labelFor,
  active,
  onPick,
  onClear,
  saved = [],
  onOpenSaved,
  onSaveCurrent,
}: {
  /** The rows already on the page for one dimension. */
  rows: (dim: string) => Row[]
  /** How a value is written for a person: a country code is not a country. */
  labelFor: (dim: string, value: string) => string
  active: { dim: string; value: string }[]
  onPick: (dim: string, value: string) => void
  onClear: () => void
  /** Views saved earlier: the filters and range somebody keeps coming back to. */
  saved?: { id: string; name: string; on: boolean }[]
  onOpenSaved?: (id: string) => void
  onSaveCurrent?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [dim, setDim] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Escape steps back one level before it closes the whole thing.
      if (dim) setDim(null)
      else setOpen(false)
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open, dim])

  useEffect(() => {
    if (dim) search.current?.focus()
    setQ('')
  }, [dim])

  const values = useMemo(() => {
    if (!dim) return []
    const needle = q.trim().toLowerCase()
    return rows(dim)
      .map((r) => ({ value: r.value, label: labelFor(dim, r.value), visitors: r.visitors }))
      .filter((v) => !needle || v.label.toLowerCase().includes(needle) || v.value.toLowerCase().includes(needle))
      .slice(0, 60)
  }, [dim, q, rows, labelFor])

  const picked = (d: string) => active.some((f) => f.dim === d)
  const label = dim ? FILTER_GROUPS.flatMap((g) => g.dims).find((d) => d.dim === dim) : null

  return (
    <div ref={root} style={{ position: 'relative' }}>
      <button
        type="button"
        className={active.length ? 'btn filter on' : 'btn filter'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o)
          setDim(null)
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M3 6h18M7 12h10M10 18h4" />
        </svg>
        Filter
        {active.length > 0 && <span className="filter-count num">{active.length}</span>}
      </button>

      {open && (
        <div className="pop filter-pop" role="menu">
          {!dim ? (
            <>
              {FILTER_GROUPS.map((g) => (
                <div key={g.name} className="filter-group">
                  <p className="filter-head">{g.name}</p>
                  {g.dims.map((d) => {
                    const n = rows(d.dim).length
                    return (
                      <button key={d.dim} type="button" role="menuitem" disabled={n === 0} onClick={() => setDim(d.dim)}>
                        <span>{d.label}</span>
                        {picked(d.dim) && <span className="filter-on" aria-label="filtered">•</span>}
                        <span className="faint num">{n === 0 ? (d.note ?? '—') : n}</span>
                      </button>
                    )
                  })}
                </div>
              ))}
              {/* Saved views live here too, because this is where somebody
                  looks for "the filter I use every Monday". */}
              <div className="filter-group">
                <p className="filter-head">Saved views</p>
                {saved.map((v) => (
                  <button key={v.id} type="button" role="menuitem" onClick={() => (onOpenSaved?.(v.id), setOpen(false))}>
                    <span>{v.name}</span>
                    {v.on && <span className="filter-on" aria-label="open now">•</span>}
                  </button>
                ))}
                {onSaveCurrent && (
                  <button type="button" role="menuitem" className="filter-save" onClick={() => (onSaveCurrent(), setOpen(false))}>
                    <span>Save the view you are looking at…</span>
                  </button>
                )}
              </div>
              {active.length > 0 && (
                <button type="button" role="menuitem" className="filter-clear" onClick={() => (onClear(), setOpen(false))}>
                  Clear {active.length} filter{active.length > 1 ? 's' : ''}
                </button>
              )}
            </>
          ) : (
            <div className="filter-values">
              <div className="filter-back">
                <button type="button" onClick={() => setDim(null)} aria-label="Back to all dimensions">
                  ←
                </button>
                <b>{label?.label ?? dim}</b>
              </div>
              <input ref={search} className="input" type="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Search ${label?.label ?? dim}`} />
              <div className="filter-list">
                {values.map((v) => (
                  <button
                    key={v.value}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onPick(dim, v.value)
                      setOpen(false)
                      setDim(null)
                    }}
                  >
                    <span title={v.label}>{v.label || '/'}</span>
                    <span className="faint num">{v.visitors.toLocaleString()}</span>
                  </button>
                ))}
                {values.length === 0 && <p className="faint">Nothing here matches “{q}”.</p>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
