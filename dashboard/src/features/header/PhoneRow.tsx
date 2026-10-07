// The phone's control line: one line that stays at the top. Live/Data and
// Story/Explore as text tabs (the group scrolls inside itself when it does not
// fit), a filter button with a count, the period as a short button ("30d"), and
// one ⋯ (which holds Share and the saved views). The filters and the period
// open a bottom sheet each.
import { ChevronDown, ListFilter } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { focusOpener, openedFrom } from '../../components/panelOpen'
import { periodShort, type PickerValue } from '../../components/DatePicker'
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
  onClear?: () => void
}

/** "30 days" as "30d", "12 months" as "12m": the line has no room for words. */
const tiny = (label: string) => label.replace(/^(\d+) days?$/, '$1d').replace(/^(\d+) months?$/, '$1m')

export function PhoneRow(p: PhoneProps & { value: PickerValue; today: ISODate; stuck?: boolean }) {
  const [open, setOpen] = useState<SheetProps['mode'] | null>(null)
  const [opener, setOpener] = useState<HTMLButtonElement | null>(null)
  // Focus goes back to the button that opened it; when another panel takes over (back false) it returns there.
  const close = (back = true) => {
    setOpen(null)
    openedFrom(opener)
    if (back) focusOpener()
  }
  const show = (mode: SheetProps['mode']) => (e: { currentTarget: HTMLButtonElement }) => {
    setOpener(e.currentTarget)
    setOpen(mode)
  }
  // The tabs scroll inside their own box: keep the chosen one in sight.
  const tabs = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const fit = () => {
      const box = tabs.current
      const on = box?.querySelector<HTMLElement>('.sv-switch .on')
      if (box && on) box.scrollLeft = Math.max(0, on.offsetLeft + on.offsetWidth - box.clientWidth)
    }
    const ids = [200, 600, 1400].map((ms) => window.setTimeout(fit, ms))
    return () => ids.forEach((id) => window.clearTimeout(id))
  }, [])
  const n = p.active.length
  return (
    <div className="subbar phone-row" data-stuck={p.stuck || undefined}>
      <div ref={tabs} className="pr-tabs">
        {!isShared() && <ViewSwitch live={false} />}
        <div id="sv-slot" className="sv-slot" />
      </div>
      {!isShared() && (
        <button type="button" className="pr-btn pr-filter" aria-haspopup="dialog" aria-expanded={open === 'filters'} aria-label={n ? copy.filterCount(n) : copy.filter} onClick={show('filters')}>
          <ListFilter size={18} strokeWidth={1.75} aria-hidden="true" />
          {n > 0 && <span className="pr-badge">{n}</span>}
        </button>
      )}
      <button type="button" className="pr-btn pr-date" aria-haspopup="dialog" aria-expanded={open === 'date'} onClick={show('date')}>
        <b>{tiny(periodShort(p.value, p.today))}</b>
        <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <div className="ctl-cap ctl-do">{p.more}</div>
      <div id="sv-back" className="sv-back" />
      {p.period}
      {p.filter}
      {p.under}
      {open && (
        <Suspense fallback={null}>
          <PhoneSheet mode={open} active={p.active} value={p.value} today={p.today} onChange={p.onChange} onClear={p.onClear ?? (() => undefined)} onClose={close} />
        </Suspense>
      )}
    </div>
  )
}
