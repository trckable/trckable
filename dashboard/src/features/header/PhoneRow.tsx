// The phone's second row: one line. A pill with what the numbers are (the
// period, and how many filters) that opens the sheet with every choice, and
// ⋯ (which holds Share and the saved views).
import { ChevronDown } from 'lucide-react'
import { lazy, Suspense, useState, type ReactNode } from 'react'
import { periodLabel, type PickerValue } from '../../components/DatePicker'
import type { ISODate } from '../../lib/dates'
import { isShared } from '../../lib/me'
import { ViewSwitch } from '../live/ViewSwitch'
import { copy } from './copy'
import type { SheetProps } from './PhoneSheet'

const PhoneSheet = lazy(() => import('./PhoneSheet'))

export interface PhoneProps extends Pick<SheetProps, 'active' | 'value' | 'today' | 'onChange'> {
  more: ReactNode
  filter?: ReactNode
  /** Hosts only (the saved views' list). */
  under?: ReactNode
  /** The date picker, which on a phone is only its popover and its keys. */
  period: ReactNode
}

export function PhoneRow(p: PhoneProps & { value: PickerValue; today: ISODate }) {
  const [open, setOpen] = useState(false)
  const n = p.active.length
  return (
    <div className="subbar phone-row">
      <button type="button" className="phone-pill" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <span className="pill-dot" aria-hidden="true" />
        <b>{periodLabel(p.value, p.today)}</b>
        {n > 0 && <span className="pill-note">{copy.filterNote(n)}</span>}
        <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <div className="ctl-cap ctl-do">{p.more}</div>
      {p.period}
      {p.filter}
      {p.under}
      {open && (
        <Suspense fallback={null}>
          <PhoneSheet active={p.active} value={p.value} today={p.today} onChange={p.onChange} switcher={isShared() ? undefined : <ViewSwitch live={false} />} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </div>
  )
}
