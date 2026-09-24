// The date picker's popover: presets, the two-month calendar, typed dates and
// the comparison. Its own chunk, loaded the first time the picker opens.
import { useEffect, useMemo, useRef, useState } from 'react'
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
  type CompareMode,
  type ISODate,
  type Range,
} from '../lib/dates'



import { CalendarIcon, Chevron, type PickerValue } from './DatePicker'
import './DateRangePopover.css'

const CMP_LABEL: Record<CompareMode, string> = {
  none: 'No comparison',
  previous: 'Previous period',
  year: 'Same period last year',
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
            <span className="num">{new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: tz })}</span>
            <span className="faint">{fmtDay(today, { weekday: true })}</span>
            {tz && <span className="faint tz">{tz.split('/').pop()?.replace(/_/g, ' ')}</span>}
          </div>
          <div className="periods-grid">
            {VISIBLE_PRESETS().map((p) => {
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
                  {p.label}
                  {p.id === 'now' && <span className="pulse" aria-hidden="true" />}
                  {p.key && <span className="kbd">{caps(keyFor('period.' + p.id)).join('')}</span>}
                </button>
              )
            })}
          </div>
          <label className="periods-compare">
            <input
              type="checkbox"
              checked={draft.compare !== 'none'}
              onChange={(e) => setDraft((d) => ({ ...d, compare: e.target.checked ? 'previous' : 'none' }))}
              style={{ width: 15, height: 15, accentColor: 'var(--accent)' }}
            />
            Compare with the period before
            {draft.compare !== 'none' && cmp && <span className="faint num">{fmtRange(cmp, today)}</span>}
          </label>
          {onBucket && (
            <div className="periods-bucket">
              <span className="faint">Show</span>
              <div className="seg" role="group" aria-label="Granularity">
                {bucketsFor(diffDays(draft.range.from, draft.range.to) + 1).map((b) => (
                  <button key={b ?? 'auto'} type="button" aria-pressed={b === bucket || (!bucket && b === undefined)} onClick={() => onBucket(b)}>
                    {b ? BUCKET_LABEL[b] : 'Auto'}
                  </button>
                ))}
              </div>
              {!bucket && autoBucket && <span className="faint auto-note">{BUCKET_LABEL[autoBucket as Bucket]}</span>}
            </div>
          )}
          <div className="periods-foot">
            <span className="faint num">{fmtRange(draft.range, today)}</span>
            <button type="button" className="btn" onClick={() => setView('calendar')}>
              <CalendarIcon />
              Pick dates
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

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button type="button" className="btn icon ghost" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))} disabled={month <= startOfMonth(minDate)}>
            <Chevron dir="left" />
          </button>
          <div style={{ display: 'flex', gap: 8, fontSize: 12 }} className="muted">
            {editing === 'compare' ? (
              <span>
                <span className="dot" style={{ display: 'inline-block', background: 'var(--ch-7)', marginRight: 6 }} />
                Picking the comparison range
              </span>
            ) : anchor ? (
              <span>Now pick the end date</span>
            ) : (
              <span>Click a start date, then an end date</span>
            )}
          </div>
          <button type="button" className="btn icon ghost" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))} disabled={addMonths(month, 1) > startOfMonth(today)}>
            <Chevron dir="right" />
          </button>
        </div>

        <div className="months" onKeyDown={onGridKey}>
          {[month, addMonths(month, 1)].map((m) => (
            <Month
              key={m}
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={draft.compare !== 'none'}
              onChange={(e) => {
                setDraft((d) => ({ ...d, compare: e.target.checked ? 'previous' : 'none' }))
                if (!e.target.checked) setEditing('main')
              }}
              style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
            />
            Compare
            {draft.compare !== 'none' && (
              <select
                value={draft.compare}
                onChange={(e) => {
                  const c = e.target.value as CompareMode
                  setDraft((d) => ({ ...d, compare: c, compareCustom: c === 'custom' ? (d.compareCustom ?? compareRange(d.range, 'previous')!) : d.compareCustom }))
                  setEditing(c === 'custom' ? 'compare' : 'main')
                  setAnchor(null)
                }}
                className="input"
                style={{ height: 34, width: 'auto', padding: '0 10px' }}
                aria-label="Compare to"
              >
                {(['previous', 'year', 'custom'] as CompareMode[]).map((c) => (
                  <option key={c} value={c}>
                    {CMP_LABEL[c]}
                  </option>
                ))}
              </select>
            )}
            {cmp && (
              <span className="faint num" style={{ fontSize: 12 }}>
                {fmtRange(cmp, today)}
              </span>
            )}
          </label>
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
}) {
  const weeks = useMemo(() => monthGrid(p.month), [p.month])
  const [y, m] = p.month.split('-').map(Number)
  return (
    <div>
      <div className="month-title">
        {monthLong[m - 1]} {y}
      </div>
      <table role="grid" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead>
          <tr>
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
              <th key={d} className="faint" style={{ fontSize: 10.5, fontWeight: 500, padding: '2px 0 4px' }}>
                {d}
              </th>
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
                const inO = p.other && d >= p.other.from && d <= p.other.to
                const disabled = d > p.today || d < p.minDate
                // Rounded where the band starts and ends, including at the
                // edges of a week, so a range reads as one ribbon.
                const radius = [start || di === 0 ? 8 : 0, end || di === 6 ? 8 : 0]
                return (
                  <td key={d} style={{ padding: 0 }}>
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
                      className={'day num' + (inR ? ' in' : '') + (start || end ? ' edge' : '') + (d === p.today ? ' today' : '')}
                      style={{
                        borderRadius: `${radius[0]}px ${radius[1]}px ${radius[1]}px ${radius[0]}px`,
                        background: start || end ? p.color : inR ? `color-mix(in srgb, ${p.color} 16%, transparent)` : undefined,
                        color: start || end ? 'var(--accent-ink)' : disabled ? 'var(--border-2)' : undefined,
                        boxShadow: inO && !inR ? `inset 0 -2px 0 ${p.otherColor}` : undefined,
                      }}
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
