// The filters in force, on the toolbar's left. Two stay in sight as chips;
// the rest fold into "+N more", a dropdown that lists every filter with its
// own ×, and holds Clear all and Save this view. A row of five chips and two
// buttons wrapped onto a second line and read as clutter.
import { Bookmark, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { usePhoneLock } from './lockScroll'
import './ActiveFilters.css'

/** One filter as a person reads it; `raw` is what goes back on remove. */
export type Shown<T> = { key: string; dim: string; value: string; dot?: string; raw: T }

// Chips kept in sight: two on a wide screen; none on a phone, where even
// two wrap onto a second row — there one pill says how many and opens the list.
const phoneQuery = '(max-width: 640px)'
function useInSight() {
  const [phone, setPhone] = useState(() => window.matchMedia(phoneQuery).matches)
  useEffect(() => {
    const m = window.matchMedia(phoneQuery)
    const on = () => setPhone(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return phone ? 0 : 2
}

export function ActiveFilters<T>({ filters, onRemove, onClear, onSave }: { filters: Shown<T>[]; onRemove: (raw: T) => void; onClear: () => void; onSave: () => void }) {
  const [open, setOpen] = useState(false)
  const IN_SIGHT = useInSight()
  const root = useRef<HTMLDivElement>(null)
  usePhoneLock(open)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  useEffect(() => {
    if (filters.length <= IN_SIGHT) setOpen(false)
  }, [filters.length, IN_SIGHT])
  if (!filters.length) return null

  const chip = (f: Shown<T>) => (
    <span key={f.key} className="chip">
      {f.dot && <span className="dot" style={{ background: f.dot }} />}
      <span className="faint">{f.dim} is</span>
      <b title={f.value}>{f.value}</b>
      <button type="button" aria-label={`Remove filter ${f.dim} is ${f.value}`} onClick={() => onRemove(f.raw)}>
        <X size={13} strokeWidth={2} aria-hidden="true" />
      </button>
    </span>
  )
  const rest = filters.length - IN_SIGHT
  return (
    <>
      {filters.slice(0, IN_SIGHT).map(chip)}
      {rest > 0 ? (
        <div ref={root} style={{ position: 'relative' }}>
          <button type="button" className={'chip more' + (open ? ' on' : '')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {IN_SIGHT ? `+${rest} more` : `${filters.length} filter${filters.length === 1 ? '' : 's'}`}
          </button>
          {open && (
            <div className="pop menu-pop filters-pop" role="menu">
              <div className="menu-pop-head">
                <b>Filters</b>
                <span className="faint">{filters.length} in force</span>
              </div>
              <div className="menu-list">
                {filters.map((f) => (
                  <div key={f.key} className="menu-row">
                    <span className="menu-text">
                      <span className="menu-title" title={f.value}>
                        {f.value}
                      </span>
                      <span className="menu-sub">{f.dim}</span>
                    </span>
                    <button type="button" className="menu-x" aria-label={`Remove filter ${f.dim} is ${f.value}`} onClick={() => onRemove(f.raw)}>
                      <X size={15} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="menu-foot split">
                <button type="button" className="menu-clear" onClick={() => (onClear(), setOpen(false))}>
                  <X size={14} strokeWidth={1.75} aria-hidden="true" />
                  Clear all
                </button>
                <button type="button" className="menu-clear save" onClick={() => (onSave(), setOpen(false))}>
                  <Bookmark size={14} strokeWidth={1.75} aria-hidden="true" />
                  Save this view
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <button type="button" className="chip more" onClick={onSave} title="Save these filters as a view">
          <Bookmark size={13} strokeWidth={1.75} aria-hidden="true" />
          Save view
        </button>
      )}
    </>
  )
}
