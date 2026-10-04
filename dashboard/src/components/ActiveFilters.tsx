// The filters in force, on the toolbar's left: one chip for each dimension
// and op ("Country is DE or AT"), whose "is" turns into "is not" when pressed.
// Two stay in sight as chips; the rest fold into "+N more", a dropdown that
// lists every one with its own ×, and holds Clear all and Save. A row of five
// chips and two buttons wrapped onto a second line and read as clutter.
import { Bookmark, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { rowCopy as t } from '../features/header/rowCopy'
import { usePhoneLock } from './lockScroll'
import './ActiveFilters.css'
import './MenuPop.css'
import { truncateMiddle } from '../lib/visitor'

/** One chip as a person reads it; `raw` is what goes back on remove and flip. */
export type Shown<T> = { key: string; dim: string; op: string; not: boolean; value: string; dot?: string; raw: T }

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

interface Props<T> {
  filters: Shown<T>[]
  onRemove: (raw: T) => void
  onFlip: (raw: T) => void
  onClear: () => void
  onSave: () => void
  /** Two or more filters: what is on screen is worth keeping as a segment. */
  compound: boolean
}

export function ActiveFilters<T>({ filters, onRemove, onFlip, onClear, onSave, compound }: Props<T>) {
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
  if (open && filters.length <= IN_SIGHT) setOpen(false)
  if (!filters.length) return null

  const chip = (f: Shown<T>) => (
    <span key={f.key} className="chip">
      {f.dot && <span className="dot" style={{ background: f.dot }} />}
      <span className="faint">
        {f.dim}{' '}
        <button type="button" className="op" aria-label={t.flip(f.dim, f.not)} title={t.flip(f.dim, f.not)} onClick={() => onFlip(f.raw)}>
          {f.op}
        </button>
      </span>
      <b title={f.value}>{truncateMiddle(f.value, 32)}</b>
      <button type="button" aria-label={t.removeSet(f.dim, f.op, f.value)} onClick={() => onRemove(f.raw)}>
        <X size={13} strokeWidth={2} aria-hidden="true" />
      </button>
    </span>
  )
  const rest = filters.length - IN_SIGHT
  const saveChip = compound ? t.saveSegment : t.saveOne
  return (
    <>
      {filters.slice(0, IN_SIGHT).map(chip)}
      {rest > 0 ? (
        <>
        <div ref={root} style={{ position: 'relative' }}>
          <button type="button" className={'chip more' + (open ? ' on' : '')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {IN_SIGHT ? t.more(rest) : t.count(filters.length)}
          </button>
          {open && (
            <div className="pop menu-pop filters-pop" role="menu">
              <div className="menu-pop-head">
                <b>{t.title}</b>
                <span className="faint">{t.inForce(filters.length)}</span>
              </div>
              <div className="menu-list">
                {filters.map((f) => (
                  <div key={f.key} className="menu-row">
                    <span className="menu-text">
                      <span className="menu-title" title={f.value}>
                        {f.value}
                      </span>
                      <span className="menu-sub">
                        {f.dim}{' '}
                        <button type="button" className="menu-op" aria-label={t.flip(f.dim, f.not)} title={t.flip(f.dim, f.not)} onClick={() => onFlip(f.raw)}>
                          {f.op}
                        </button>
                      </span>
                    </span>
                    <button type="button" className="menu-x" aria-label={t.removeSet(f.dim, f.op, f.value)} onClick={() => onRemove(f.raw)}>
                      <X size={15} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="menu-foot split">
                <button type="button" className="menu-clear" onClick={() => { onClear(); setOpen(false) }}>
                  <X size={14} strokeWidth={1.75} aria-hidden="true" />
                  {t.clear}
                </button>
                <button type="button" className="menu-clear save" onClick={() => { onSave(); setOpen(false) }}>
                  <Bookmark size={14} strokeWidth={1.75} aria-hidden="true" />
                  {compound ? t.saveInMenu : t.saveInMenuOne}
                </button>
              </div>
            </div>
          )}
        </div>
        {/* Three or more: the same offer, as one small icon at the row's end. */}
        {IN_SIGHT > 0 && compound && (
          <button type="button" className="chip more icon" onClick={onSave} aria-label={t.saveSegment} title={t.saveSegmentTitle}>
            <Bookmark size={14} strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
        </>
      ) : (
        <button type="button" className="chip more" onClick={onSave} title={compound ? t.saveSegmentTitle : t.saveOneTitle}>
          <Bookmark size={13} strokeWidth={1.75} aria-hidden="true" />
          {saveChip}
        </button>
      )}
    </>
  )
}
