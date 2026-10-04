// The calendar's way into the Data view: the switch between the chart and the
// calendar, and the calendar itself, which is a chunk of its own (nothing of it
// loads until it is asked for).
import { lazy, Suspense } from 'react'
import type { Filter } from '../../lib/api'
import { Loading } from '../../components/loading/Loading'
import { toggleCopy } from './toggleCopy'

const CalendarView = lazy(() => import('./CalendarView'))

export function CalendarToggle({ cal, onPick }: { cal: boolean; onPick: (cal: boolean) => void }) {
  return (
    <div className="seg small cal-toggle" role="group" aria-label={toggleCopy.calendar}>
      <button type="button" aria-pressed={!cal} onClick={() => onPick(false)}>
        {toggleCopy.chart}
      </button>
      <button type="button" aria-pressed={cal} onClick={() => onPick(true)}>
        {toggleCopy.calendar}
      </button>
    </div>
  )
}

export interface CalendarSlotProps {
  site: string
  /** The address's calendar value (url.ts). */
  cal: string
  periodEnd: string
  filters: Filter[]
  test?: boolean
  /** Plans may be added: an owner, with notes on. */
  plans: boolean
  /** A note or plan changed: the chart's markers read them again. */
  onChanged: () => void
}

export function CalendarSlot(p: CalendarSlotProps) {
  return (
    <Suspense fallback={<Loading height={420} />}>
      <CalendarView {...p} />
    </Suspense>
  )
}
