// The date picker's popover: presets, the two-month calendar, typed dates and
// the comparison. Its own chunk, loaded the first time the picker opens.
import { Check, Clock3 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Switch } from './Switch'
import { caps, keyFor } from '../lib/keys'
import { useLockScroll } from './lockScroll'
import type { Bucket } from '../lib/api'
import {
  VISIBLE_PRESETS,
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



import { CalendarIcon, Chevron, type PickerValue } from './DatePicker'
import './DateRangePopover.css'

const CMP_LABEL: Record<CompareMode, string> = {
  none: 'No comparison',
  previous: 'Period before',
  year: 'Last year',
  custom: 'Custom',
}


const BUCKET_LABEL: Record<Bucket, string> = { hour: 'Hourly', day: 'Daily', week: 'Weekly', month: 'Monthly' }

/** Which granularities make sense for a period this long (undefined = auto). */
function bucketsFor(days: number): (Bucket | undefined)[] {
  const out: (Bucket | undefined)[] = [undefined]
  if (days <= 14) out.push('hour')
  if (days <= 400) out.push('day')
  if (days >= 7) out.push('week')
  if (days >= 60) out.push('month')
  return out.length > 2 ? out : []
}


/** Phone labels: the chip has room for "30d", not "Last 30 days". */

// The periods, in the three ways people think about time: what is happening,
// a rolling stretch, and the calendar's own weeks, months and years.
const PERIOD_GROUPS = [
  { name: 'Live', ids: ['now', 'today', 'yesterday'] },
  { name: 'Rolling', ids: ['7d', '30d', '90d', '12mo'] },
  { name: 'Calendar', ids: ['wtd', 'mtd', 'lastmonth', 'ytd'] },
]

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
    dialog.current?.querySelector<HTMLElement>(`[data-day="${focusDay}"]`)?.focus({ preventScroll: true })
    // focus only when the dialog opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const preview: Range | null = anchor && hoverDay ? (hoverDay < anchor ? { from: hoverDay, to: anchor } : { from: anchor, to: hoverDay }) : null
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
    next = next > today ? today : next < minDate ? minDate : next
    setFocusDay(next)
    if (anchor) setHoverDay(next)
    if (next < month) setMonth(startOfMonth(next))
    else if (next >= addMonths(month, 2)) setMonth(startOfMonth(addMonths(next, -1)))
    requestAnimationFrame(() => dialog.current?.querySelector<HTMLElement>(`[data-day="${next}"]`)?.focus({ preventScroll: true }))
  }

  const nDays = diffDays(draft.range.from, draft.range.to) + 1
  const bucketHint = nDays <= 2 ? 'by hour' : nDays <= 120 ? 'by day' : nDays <= 730 ? 'by week' : 'by month'

  return (
    <>
      {/* On a phone the sheet floats over the dashboard; this dims and softly
          blurs what is behind it, and closes on a tap outside. */}
      <div className="pop-backdrop" onClick={onCancel} aria-hidden="true" />
    <div
      ref={dialog}
      className={view === 'periods' ? 'pop sheet range-pop small' : 'pop sheet range-pop'}
      role="dialog"
      aria-label="Choose a date range"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onCancel()
        }
      }}
    >
      {view === 'periods' ? (
        <div className="periods" role="listbox" aria-label="Periods">
          <div className="periods-head">
            <Clock3 size={15} strokeWidth={1.75} aria-hidden="true" />
            <span className="num">{new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: tz })}</span>
            <span className="faint">{fmtDay(today, { weekday: true })}</span>
            {tz && <span className="tz">{tz.split('/').pop()?.replace(/_/g, ' ')}</span>}
          </div>
          {PERIOD_GROUPS.map((g) => (
            <div key={g.name} className="periods-group">
              <span className="periods-group-head">{g.name}</span>
              <div className="periods-grid">
                {VISIBLE_PRESETS()
                  .filter((p) => g.ids.includes(p.id))
                  .map((p) => {
                    const on = draft.period === p.id
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="option"
                        aria-selected={on}
                        className={on ? 'period on' : 'period'}
                        onClick={() => onApply({ ...draft, period: p.id, range: p.range(today) })}
                      >
                        {p.id === 'now' && <span className="pulse" aria-hidden="true" />}
                        <span className="period-name">{p.label}</span>
                        {on ? <Check size={14} strokeWidth={2.25} className="period-check" aria-hidden="true" /> : p.key && <span className="period-key">{caps(keyFor('period.' + p.id)).join('')}</span>}
                      </button>
                    )
                  })}
              </div>
            </div>
          ))}
          <div className="periods-options">
            <label className="periods-compare">
              <span className="compare-text">
                <span>Compare with the period before</span>
                <span className="faint">{draft.compare !== 'none' && cmp ? fmtRange(cmp, today) : 'A second line for the same stretch before'}</span>
              </span>
              <Switch on={draft.compare !== 'none'} label="Compare with the period before" onChange={() => setDraft((d) => ({ ...d, compare: d.compare !== 'none' ? 'none' : 'previous' }))} />
            </label>
            {onBucket && (
              <div className="periods-bucket">
                <span>Detail</span>
                <div className="seg" role="group" aria-label="Detail">
                  {bucketsFor(diffDays(draft.range.from, draft.range.to) + 1).map((b) => (
                    <button key={b ?? 'auto'} type="button" aria-pressed={b === bucket || (!bucket && b === undefined)} onClick={() => onBucket(b)}>
                      {b ? BUCKET_LABEL[b] : !bucket && autoBucket ? `Auto · ${BUCKET_LABEL[autoBucket as Bucket].toLowerCase()}` : 'Auto'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="periods-foot">
            <span className="periods-range num">{fmtRange(draft.range, today)}</span>
            <button type="button" className="btn" onClick={() => setView('calendar')}>
              <CalendarIcon />
              Custom dates
            </button>
            {draft.compare !== value.compare && (
              <button type="button" className="btn primary" onClick={() => onApply(draft)}>
                Apply
              </button>
            )}
          </div>
        </div>
      ) : (
      <div className="pop-body">
        <button type="button" className="back-link" onClick={() => setView('periods')}>
          <Chevron dir="left" />
          Periods
        </button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <DateField label="Start date" value={shown.from} today={today} onCommit={(d) => setActive({ from: d, to: d > active.to ? d : active.to })} />
          <span className="faint" style={{ paddingBottom: 12 }}>–</span>
          <DateField label="End date" value={shown.to} today={today} onCommit={(d) => setActive({ from: d < active.from ? d : active.from, to: d > today ? today : d })} />
          <span className="faint num" style={{ fontSize: 12, paddingBottom: 12, marginLeft: 'auto' }}>
            {diffDays(shown.from, shown.to) + 1} days · {bucketHint}
          </span>
        </div>

        <p className="cal-hint">
          {editing === 'compare' ? (
            <>
              <span className="dot" style={{ display: 'inline-block', background: 'var(--ch-7)', borderRadius: '50%' }} /> Picking the comparison range
            </>
          ) : anchor ? (
            'Now pick the end date'
          ) : (
            'Pick a start date, then an end date'
          )}
        </p>

        <div className="months" onKeyDown={onGridKey}>
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
              <span>Compare</span>
              <span className="faint">{cmp ? fmtRange(cmp, today) : 'A second line on the chart'}</span>
            </span>
            <Switch
              on={draft.compare !== 'none'}
              label="Compare"
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
                    setDraft((d) => ({ ...d, compare: c, compareCustom: c === 'custom' ? (d.compareCustom ?? compareRange(d.range, 'previous')!) : d.compareCustom }))
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
                Edit date range
              </button>
              <button type="button" role="tab" aria-selected={editing === 'compare'} onClick={() => setEditing('compare')}>
                Edit comparison
              </button>
            </div>
          )}
        </div>

        <div className="pop-actions">
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={() => onApply(draft)} disabled={!!anchor}>
            Apply
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
  useEffect(() => {
    setText(value)
    setBad(false)
  }, [value])
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
