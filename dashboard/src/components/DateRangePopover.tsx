// The date picker's popover: presets, the two-month calendar, typed dates and
// the comparison. Its own chunk, loaded the first time the picker opens.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Switch } from './Switch'
import { useLockScroll } from './lockScroll'
import type { Bucket } from '../lib/api'
import { Periods } from './DateRangePeriods'
import {
  addDays,
  addMonths,
  compareRange,
  diffDays,
  fmtDay,
  fmtRange,
  monthGrid,
  monthLong,
  parseLoose,
  startOfMonth,
  weekStartsOn,
  type CompareMode,
  type ISODate,
  type Range,
} from '../lib/dates'
import { Chevron, type PickerValue } from './DatePicker'
import { CMP_LABEL, calendarCopy as c } from './dateRangeCopy'
import './DateRangePopover.css'

/** The days from a to b, whichever comes first. */
const span = (a: ISODate, b: ISODate): Range => (a < b ? { from: a, to: b } : { from: b, to: a })

/** What the calendar's footer says the chart will show for this many days. */
function bucketHintFor(nDays: number) {
  if (nDays <= 2) return 'by hour'
  if (nDays <= 120) return 'by day'
  if (nDays <= 730) return 'by week'
  return 'by month'
}

export default function Popover({
  value,
  today,
  minDate,
  tz,
  bucket,
  autoBucket,
  onBucket,
  onApply,
  onCancel,
}: {
  value: PickerValue
  today: ISODate
  minDate: ISODate
  tz?: string
  bucket?: Bucket
  autoBucket?: string
  onBucket?: (b?: Bucket) => void
  onApply: (v: PickerValue) => void
  onCancel: () => void
}) {
  useLockScroll()
  const [draft, setDraft] = useState<PickerValue>(value)
  // One thing at a time: the periods first, the calendar only if you want it.
  const [view, setView] = useState<'periods' | 'calendar'>('periods')
  const [editing, setEditing] = useState<'main' | 'compare'>('main')
  const [anchor, setAnchor] = useState<ISODate | null>(null) // first click of a range
  const [hoverDay, setHoverDay] = useState<ISODate | null>(null)
  const [month, setMonth] = useState(startOfMonth(addMonths(value.range.to, -1)))
  const [focusDay, setFocusDay] = useState<ISODate>(value.range.to)
  const dialog = useRef<HTMLDivElement>(null)

  const cmp = compareRange(draft.range, draft.compare, draft.compareCustom, draft.period)
  const active = editing === 'main' ? draft.range : (draft.compareCustom ?? cmp ?? draft.range)

  useEffect(() => {
    const box = dialog.current // focus moves in: a day, else the chosen period, else the box
    ;(box?.querySelector<HTMLElement>(`[data-day="${focusDay}"]`) ?? box?.querySelector<HTMLElement>('[aria-selected=true]') ?? box)?.focus({ preventScroll: true })
    // focus only when the dialog opens
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
    requestAnimationFrame(() => dialog.current?.querySelector<HTMLElement>(`[data-day="${next}"]`)?.focus({ preventScroll: true }))
  }

  const nDays = diffDays(draft.range.from, draft.range.to) + 1
  const bucketHint = bucketHintFor(nDays)
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
    <>
      {/* On a phone the sheet floats over the dashboard; this dims and softly
          blurs what is behind it, and closes on a tap outside. */}
      <div className="pop-backdrop" onClick={onCancel} aria-hidden="true" />
    {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape anywhere inside the dialog closes it */}
    <div
      ref={dialog}
      className={view === 'periods' ? 'pop sheet range-pop small' : 'pop sheet range-pop'}
      role="dialog" tabIndex={-1} aria-label={c.dialog}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onCancel()
        }
      }}
    >
      {view === 'periods' ? (
        <Periods
          draft={draft}
          value={value}
          today={today}
          tz={tz}
          bucket={bucket}
          autoBucket={autoBucket}
          compareRange={cmp}
          onDraft={setDraft}
          onBucket={onBucket}
          onApply={onApply}
          onCustom={() => setView('calendar')}
        />
      ) : (
      <div className="pop-body">
        <button type="button" className="back-link" onClick={() => setView('periods')}>
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
      )}
    </div>
    </>
  )
}

export function Month(p: {
  month: ISODate
  today: ISODate
  minDate: ISODate
  range: Range
  other: Range | null
  color: string
  otherColor: string
  focusDay: ISODate
  onPick: (d: ISODate) => void
  onHover: (d: ISODate) => void
  /** Arrows beside the month's name: the first month steps back, the last forward. */
  before?: React.ReactNode
  after?: React.ReactNode
}) {
  const weeks = useMemo(() => monthGrid(p.month), [p.month])
  const [y, m] = p.month.split('-').map(Number)
  const single = p.range.from === p.range.to
  return (
    <div className="month">
      <div className="month-title">
        {p.before ?? <span className="month-nav-gap" />}
        <span>
          {monthLong[m - 1]} {y}
        </span>
        {p.after ?? <span className="month-nav-gap" />}
      </div>
      <table role="grid" className="month-grid" style={{ ['--pick' as string]: p.color, ['--other' as string]: p.otherColor }}>
        <thead>
          <tr>
            {(weekStartsOn() === 0 ? ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']).map((d) => (
              <th key={d}>{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((w, wi) => (
            <tr key={wi}>
              {w.map((d, di) => {
                if (!d) return <td key={di} />
                const inR = d >= p.range.from && d <= p.range.to
                const start = d === p.range.from
                const end = d === p.range.to
                const inO = !!p.other && d >= p.other.from && d <= p.other.to
                const disabled = d > p.today || d < p.minDate
                // The band runs behind the days as one ribbon, round where a
                // week (or the month) starts or ends inside it.
                const cls = [
                  inR && !single ? 'band' : '',
                  start ? 'from' : '',
                  end ? 'to' : '',
                  di === 0 || !w[di - 1] ? 'row-start' : '',
                  di === 6 || !w[di + 1] ? 'row-end' : '',
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <td key={d} className={cls || undefined}>
                    <button
                      type="button"
                      data-day={d}
                      tabIndex={d === p.focusDay ? 0 : -1}
                      disabled={disabled}
                      aria-pressed={inR}
                      aria-current={d === p.today ? 'date' : undefined}
                      aria-label={fmtDay(d, { weekday: true, year: true })}
                      onClick={() => p.onPick(d)}
                      onMouseEnter={() => p.onHover(d)}
                      className={'day num' + (inR ? ' in' : '') + (start || end ? ' edge' : '') + (d === p.today ? ' today' : '') + (inO && !inR ? ' other' : '')}
                    >
                      {+d.slice(8)}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DateField({ label, value, today, onCommit }: { label: string; value: ISODate; today: ISODate; onCommit: (d: ISODate) => void }) {
  const [text, setText] = useState(value)
  const [bad, setBad] = useState(false)
  // A new value from outside (a click in the calendar) replaces what was typed.
  const [shownValue, setShownValue] = useState(value)
  if (shownValue !== value) {
    setShownValue(value)
    setText(value)
    setBad(false)
  }
  const commit = () => {
    const d = parseLoose(text, today)
    if (d && d <= today) onCommit(d)
    else setBad(text !== value)
  }
  return (
    <label className="field">
      {label}
      <input
        className="input num"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        aria-invalid={bad}
        style={{ height: 38, borderColor: bad ? 'var(--down)' : undefined }}
        placeholder="YYYY-MM-DD"
      />
    </label>
  )
}
