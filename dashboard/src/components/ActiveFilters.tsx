// The filters in force, first on the control row's left: one chip for each
// dimension and op ("Country is DE or AT"), whose "is" turns into "is not" when
// pressed. The row is one line, so the chips that do not fit fold into "+N
// more", a dropdown that lists every one with its own ×, and holds Clear all
// and Save. After them comes Save view, as an icon.
import { Bookmark, BookmarkPlus, ChevronDown, Plus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { rowCopy as t } from '../features/header/rowCopy'
import { usePhoneLock } from './lockScroll'
import './ActiveFilters.css'
import './MenuPop.css'
import { useChipFit } from './useChipFit'
import { truncateMiddle } from '../lib/visitor'
import { filterMenu } from './panelOpen'

/** One chip as a person reads it; `raw` is what goes back on remove and flip. */
export type Shown<T> = { key: string; dim: string; op: string; not: boolean; value: string; dot?: string; raw: T }

// A phone keeps none in sight: one pill says how many and opens the list. Any
// wider screen counts what fits (useChipFit).
/** Past two filters the chips give way to one "N filters" chip that lists them. */
const MANY = 2
const phoneQuery = '(max-width: 640px)'
function usePhone() {
  const [phone, setPhone] = useState(() => window.matchMedia(phoneQuery).matches)
  useEffect(() => {
    const m = window.matchMedia(phoneQuery)
    const on = () => setPhone(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return phone
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
  const phone = usePhone()
  const { box, n: IN_SIGHT } = useChipFit(filters.map((f) => f.key + f.op + f.value).join('\u0000'), filters.length, phone || filters.length > MANY)
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
    <span key={f.key} className="chip" data-chip>
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
  return (
    <>
      <div ref={box} className="toolbar-filters" role="group" aria-label={t.active}>
        {filters.slice(0, IN_SIGHT).map(chip)}
        {rest > 0 && (
        <div ref={root} className="filters-more" data-more>
          <button type="button" className={'chip more' + (open ? ' on' : '')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {IN_SIGHT ? t.more(rest) : t.count(filters.length)}
            <ChevronDown size={13} strokeWidth={1.75} aria-hidden="true" />
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
              <button type="button" className="menu-add" onClick={() => { setOpen(false); filterMenu.set(true) }}>
                <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
                {t.add}
              </button>
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
        )}
      </div>
      <button type="button" className="chip more icon" onClick={onSave} aria-label={t.saveOne} title={t.saveOne}>
        <BookmarkPlus size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </>
  )
}
