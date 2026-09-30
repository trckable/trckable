// The comparison in the period's row: just an icon while there is none, its
// words once one is set. Either opens a small menu (period before, last year,
// custom dates, no comparison). The C key toggles it without the menu.
import { ChevronDown, GitCompareArrows } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useRef } from 'react'
import { copy } from '../features/header/copy'
import { useMenuNav, useOnlyOpen } from '../lib/headerMenu'
import { caps, keyFor } from '../lib/keys'
import type { CompareMode } from '../lib/dates'
import { withCustom } from './compareCustom'
import { compareWords, type PickerValue } from './DatePicker'
import { compareMenu, openedFrom, periodMenu, periodStart } from './panelOpen'

// The list is its own chunk: the icon costs the first load, the menu nothing until it is opened.
const CompareList = lazy(() => import('./CompareList'))

export function CompareControl({ value, onChange }: { value: PickerValue; onChange: (v: PickerValue) => void }) {
  const open = compareMenu.use()
  const close = useCallback(() => compareMenu.set(false), [])
  useOnlyOpen('compare', open, close)
  const root = useRef<HTMLSpanElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  useMenuNav(open, root, button, close)
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && close()
    window.addEventListener('pointerdown', away)
    return () => window.removeEventListener('pointerdown', away)
  }, [open, close])
  const on = value.compare !== 'none'
  const key = caps(keyFor('compare')).join('')
  const choose = (mode: CompareMode) => {
    close()
    button.current?.focus()
    if (mode !== 'custom') {
      onChange({ ...value, compare: mode })
      return
    }
    // Its own dates are picked on the calendar.
    onChange(withCustom({ ...value, compare: 'custom' }))
    openedFrom(button.current)
    periodStart.set('compare')
    periodMenu.set(true)
  }
  return (
    <span ref={root} className="cmp-root">
      <button
        ref={button}
        type="button"
        className={on ? 'btn ghost cmp-btn on' : 'btn ghost cmp-btn'}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={on ? undefined : copy.compare}
        title={on ? undefined : copy.compareTitle(key)}
        onClick={() => {
          periodMenu.set(false)
          compareMenu.set(!open)
        }}
      >
        <GitCompareArrows size={16} strokeWidth={1.75} className="cmp-icon" aria-hidden="true" />
        {on && <span className="cmp-words">{compareWords(value)}</span>}
        {on && <ChevronDown size={14} strokeWidth={1.75} className="cmp-chev" aria-hidden="true" />}
      </button>
      {open && (
        <Suspense fallback={null}>
          <CompareList value={value} keyCap={key} onChoose={choose} />
        </Suspense>
      )}
    </span>
  )
}
