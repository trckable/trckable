// The date picker's calendar step: two months, typed start and end dates, and
// the comparison's own dates when it is a custom one. It works on a draft that
// Apply hands over. Its own chunk, loaded with the popover.
import { useEffect, useRef, useState } from 'react'
import { Switch } from './Switch'
import {
  addDays,
  addMonths,
  compareRange,
  diffDays,
  fmtRange,
  startOfMonth,
  type CompareMode,
  type ISODate,
  type Range,
} from '../lib/dates'
import { Chevron, type PickerValue } from './DatePicker'
import { DateField, Month } from './DateRangeMonth'
import { CMP_LABEL, calendarCopy as c } from './dateRangeCopy'

/** The days from a to b, whichever comes first. */
const span = (a: ISODate, b: ISODate): Range => (a < b ? { from: a, to: b } : { from: b, to: a })

/** What the calendar's footer says the chart will show for this many days. */
function bucketHintFor(nDays: number) {
  if (nDays <= 2) return 'by hour'
  if (nDays <= 120) return 'by day'
  if (nDays <= 730) return 'by week'
  return 'by month'
}


export function CalendarPane({
  value,
  today,
  minDate,
  editing: startEditing,
  onApply,
  onCancel,
  onBack,
}: {
  value: PickerValue
  today: ISODate
  minDate: ISODate
  /** Which range the calendar edits first: the period, or the comparison's own dates. */
  editing: 'main' | 'compare'
  onApply: (v: PickerValue) => void
  onCancel: () => void
  onBack: () => void
}) {
  const [draft, setDraft] = useState<PickerValue>(value)
  const [editing, setEditing] = useState<'main' | 'compare'>(startEditing)
  const [anchor, setAnchor] = useState<ISODate | null>(null) // first click of a range
  const [hoverDay, setHoverDay] = useState<ISODate | null>(null)
  const [month, setMonth] = useState(startOfMonth(addMonths(value.range.to, -1)))
  const [focusDay, setFocusDay] = useState<ISODate>(value.range.to)
  const box = useRef<HTMLDivElement>(null)

  const cmp = compareRange(draft.range, draft.compare, draft.compareCustom, draft.period)
  const active = editing === 'main' ? draft.range : (draft.compareCustom ?? cmp ?? draft.range)

  useEffect(() => {
    // focus moves in: a day, else the box
    box.current?.querySelector<HTMLElement>(`[data-day="${focusDay}"]`)?.focus({ preventScroll: true })
    // focus only when the calendar opens
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on open; later focus moves with the arrow keys
  }, [])

  const setActive = (r: Range, period = 'custom') => {
    if (editing === 'main') setDraft((d) => ({ ...d, period, range: r }))
    else setDraft((d) => ({ ...d, compareCustom: r }))
  }

  const pick = (day: ISODate) => {
    if (day > today || day < minDate) return
    if (!anchor) {
      setAnchor(day)
      setActive({ from: day, to: day })
    } else {
      const r = day < anchor ? { from: day, to: anchor } : { from: anchor, to: day }
      setAnchor(null)
      setActive(r)
    }
    setFocusDay(day)
  }

  const preview: Range | null = anchor && hoverDay ? span(hoverDay, anchor) : null
  const shown = preview ?? active
  const otherRange = editing === 'main' ? cmp : draft.range

  const onGridKey = (e: React.KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    let next: ISODate | null = null
    if (moves[e.key] !== undefined) next = addDays(focusDay, moves[e.key])
    else if (e.key === 'PageUp') next = addMonths(focusDay, -1)
    else if (e.key === 'PageDown') next = addMonths(focusDay, 1)
    else if (e.key === 'Home') next = addDays(focusDay, -((new Date(focusDay).getUTCDay() + 6) % 7))
    else if (e.key === 'End') next = addDays(focusDay, 6 - ((new Date(focusDay).getUTCDay() + 6) % 7))
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      pick(focusDay)
      return
    }
    if (!next) return
    e.preventDefault()
    if (next > today) next = today
    else if (next < minDate) next = minDate
    setFocusDay(next)
    if (anchor) setHoverDay(next)
    if (next < month) setMonth(startOfMonth(next))
    else if (next >= addMonths(month, 2)) setMonth(startOfMonth(addMonths(next, -1)))
    requestAnimationFrame(() => box.current?.querySelector<HTMLElement>(`[data-day="${next}"]`)?.focus({ preventScroll: true }))
  }

  const bucketHint = bucketHintFor(diffDays(draft.range.from, draft.range.to) + 1)
  const calHint = () => {
    if (editing === 'compare')
      return (
        <>
          <span className="dot" style={{ display: 'inline-block', background: 'var(--ch-7)', borderRadius: '50%' }} /> {c.pickingCompare}
        </>
      )
    if (anchor) return c.pickEnd
    return c.pickStart
  }

  return (
    <div className="pop-body" ref={box}>
        <button type="button" className="back-link" onClick={onBack}>
          <Chevron dir="left" />
          {c.periods}
        </button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <DateField label="Start date" value={shown.from} today={today} onCommit={(d) => setActive({ from: d, to: d > active.to ? d : active.to })} />
          <span className="faint" style={{ paddingBottom: 12 }}>–</span>
          <DateField label="End date" value={shown.to} today={today} onCommit={(d) => setActive({ from: d < active.from ? d : active.from, to: d > today ? today : d })} />
          <span className="faint num" style={{ fontSize: 12, paddingBottom: 12, marginLeft: 'auto' }}>
            {c.daysBy(diffDays(shown.from, shown.to) + 1, bucketHint)}
          </span>
        </div>

        <p className="cal-hint">{calHint()}</p>

        {/* Arrow keys pressed on the day buttons inside bubble up to here. */}
        <div className="months" role="presentation" onKeyDown={onGridKey}>
          {[month, addMonths(month, 1)].map((m, i) => (
            <Month
              key={m}
              before={
                i === 0 ? (
                  <button type="button" className="month-nav" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))} disabled={month <= startOfMonth(minDate)}>
                    <Chevron dir="left" />
                  </button>
                ) : undefined
              }
              after={
                i === 1 ? (
                  <button type="button" className="month-nav" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))} disabled={addMonths(month, 1) > startOfMonth(today)}>
                    <Chevron dir="right" />
                  </button>
                ) : undefined
              }
              month={m}
              today={today}
              minDate={minDate}
              range={shown}
              other={otherRange}
              otherColor={editing === 'main' ? 'var(--ch-7)' : 'var(--accent)'}
              color={editing === 'main' ? 'var(--accent)' : 'var(--ch-7)'}
              focusDay={focusDay}
              onPick={pick}
              onHover={(d) => anchor && setHoverDay(d)}
            />
          ))}
        </div>

        <div className="cal-compare">
          <div className="periods-compare">
            <span className="compare-text">
              <span>{c.compare}</span>
              <span className="faint">{cmp ? fmtRange(cmp, today) : c.compareHint}</span>
            </span>
            <Switch
              on={draft.compare !== 'none'}
              label={c.compare}
              onChange={() => {
                const on = draft.compare !== 'none'
                setDraft((d) => ({ ...d, compare: on ? 'none' : 'previous' }))
                if (on) setEditing('main')
              }}
            />
          </div>
          {draft.compare !== 'none' && (
            <div className="cmp-chips" role="radiogroup" aria-label="Compare with">
              {(['previous', 'year', 'custom'] as CompareMode[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={draft.compare === c}
                  onClick={() => {
                    setDraft((d) => ({ ...d, compare: c, compareCustom: c === 'custom' ? (d.compareCustom ?? compareRange(d.range, 'previous') ?? undefined) : d.compareCustom }))
                    setEditing(c === 'custom' ? 'compare' : 'main')
                    setAnchor(null)
                  }}
                >
                  {CMP_LABEL[c]}
                </button>
              ))}
            </div>
          )}
          {draft.compare === 'custom' && (
            <div className="tabs" role="tablist" aria-label="Which range to edit">
              <button type="button" role="tab" aria-selected={editing === 'main'} onClick={() => setEditing('main')}>
                {c.editRange}
              </button>
              <button type="button" role="tab" aria-selected={editing === 'compare'} onClick={() => setEditing('compare')}>
                {c.editCompare}
              </button>
            </div>
          )}
        </div>

        <div className="pop-actions">
          <button type="button" className="btn ghost" onClick={onCancel}>
            {c.cancel}
          </button>
          <button type="button" className="btn primary" onClick={() => onApply(draft)} disabled={!!anchor}>
            {c.apply}
          </button>
        </div>
    </div>
  )
}
