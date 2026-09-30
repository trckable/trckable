// The date picker's popover: the periods list, and a step on to the calendar
// for custom dates and the comparison's own. Its own chunk, loaded the first
// time the picker opens.
import { useEffect, useRef, useState } from 'react'
import type { Bucket } from '../lib/api'
import type { CompareMode, ISODate } from '../lib/dates'
import { withCustom } from './compareCustom'
import { CalendarPane } from './DateRangeCalendar'
import { Periods } from './DateRangePeriods'
import { periodStart } from './panelOpen'
import { useLockScroll } from './lockScroll'
import type { PickerValue } from './DatePicker'
import { calendarCopy as c } from './dateRangeCopy'
import './DateRangePopover.css'

export default function Popover({
  value,
  today,
  minDate,
  tz,
  bucket,
  autoBucket,
  onBucket,
  onApply,
  onChange,
  onCancel,
}: {
  value: PickerValue
  today: ISODate
  minDate: ISODate
  tz?: string
  bucket?: Bucket
  autoBucket?: string
  onBucket?: (b?: Bucket) => void
  /** A choice that ends it: the popover closes. */
  onApply: (v: PickerValue) => void
  /** A choice that stays open: the comparison. */
  onChange: (v: PickerValue) => void
  onCancel: () => void
}) {
  useLockScroll()
  // One thing at a time: the periods first, the calendar only if you want it.
  const [cal, setCal] = useState<{ value: PickerValue; editing: 'main' | 'compare' } | null>(() =>
    periodStart.get() === 'compare' ? { value: withCustom(value), editing: 'compare' } : null,
  )
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    periodStart.set('periods')
    // focus moves in: the chosen period, else the box (the calendar takes its own day)
    const box = dialog.current
    if (!box?.querySelector('[data-day]')) (box?.querySelector<HTMLElement>('[data-initial]') ?? box)?.focus({ preventScroll: true })
  }, [])

  const compare = (mode: CompareMode) => {
    if (mode === 'custom') {
      const next = withCustom({ ...value, compare: 'custom' })
      onChange(next)
      setCal({ value: next, editing: 'compare' })
      return
    }
    onChange({ ...value, compare: value.compare === mode ? 'none' : mode })
  }

  return (
    <>
      {/* On a phone the sheet floats over the dashboard; this dims and softly
          blurs what is behind it, and closes on a tap outside. */}
      <div className="pop-backdrop" onClick={onCancel} aria-hidden="true" />
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape anywhere inside the dialog closes it */}
      <div
        ref={dialog}
        className={cal ? 'pop sheet range-pop' : 'pop sheet range-pop small'}
        role="dialog"
        tabIndex={-1}
        aria-label={c.dialog}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onCancel()
          }
        }}
      >
        {cal ? (
          <CalendarPane value={cal.value} today={today} minDate={minDate} editing={cal.editing} onApply={onApply} onCancel={onCancel} onBack={() => setCal(null)} />
        ) : (
          <Periods
            value={value}
            today={today}
            tz={tz}
            bucket={bucket}
            autoBucket={autoBucket}
            onBucket={onBucket}
            onPeriod={(p) => onApply({ ...value, period: p.id, range: p.range(today) })}
            onCompare={compare}
            onCustom={() => setCal({ value, editing: 'main' })}
          />
        )}
      </div>
    </>
  )
}
