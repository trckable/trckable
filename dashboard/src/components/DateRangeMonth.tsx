// The calendar's month grid and its typed date field (DateRangeCalendar).
// The note dialog uses the month too.
import { useId, useMemo, useState } from 'react'
import { FieldError, fieldProps } from '../kit/FieldError'
import { fieldCopy } from '../kit/fieldCopy'
import { fmtDay, monthLong, weekStartsOn, type ISODate, type Range } from '../lib/dates'
import { monthGrid, parseLoose } from '../lib/calendarDates'
import './DateRangePopover.css'

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

export function DateField({ label, value, today, onCommit }: { label: string; value: ISODate; today: ISODate; onCommit: (d: ISODate) => void }) {
  const [text, setText] = useState(value)
  const [bad, setBad] = useState(false)
  const errId = useId()
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
        onChange={(e) => {
          setText(e.target.value)
          setBad(false)
        }}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        {...fieldProps(errId, bad ? fieldCopy.date : null)}
        style={{ height: 38 }}
        placeholder="YYYY-MM-DD"
      />
      <FieldError id={errId} error={bad ? fieldCopy.date : null} />
    </label>
  )
}

