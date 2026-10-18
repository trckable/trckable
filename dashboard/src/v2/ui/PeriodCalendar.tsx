// The calendar behind "Custom dates": two months, a first and a last day picked in turn, and the unit the chart is cut in.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { addDays, addMonths, diffDays, type ISODate } from '../../lib/dates'
import { copy } from '../copy'
import type { PeriodChipProps } from './PeriodChip'

const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const short = (d: ISODate) => {
  const [y, m, day] = d.split('-').map(Number)
  return `${day} ${MON[m - 1].slice(0, 3)} ${y}`
}

/** The two ends of a pick, earliest first, whichever was clicked first. */
function ends(a: ISODate | null, b: ISODate | null): [ISODate | null, ISODate | null] {
  if (a && b) return a < b ? [a, b] : [b, a]
  return [a, a]
}

function Month({
  first,
  today,
  from,
  to,
  focus,
  onDay,
  prev,
  next,
}: {
  first: ISODate
  today: ISODate
  from: ISODate | null
  to: ISODate | null
  focus: ISODate
  onDay: (d: ISODate) => void
  prev: React.ReactNode
  next: React.ReactNode
}) {
  const [y, m] = first.split('-').map(Number)
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const days = Array.from({ length: last }, (_, i) => `${first.slice(0, 8)}${String(i + 1).padStart(2, '0')}`)
  const [lo, hi] = ends(from, to)
  const many = !!lo && !!hi && lo !== hi
  return (
    <div className="month">
      {/* One caption per month, with the arrows on it: the first month's steps back, the last month's forward. */}
      <div className="mth">
        {prev}
        <b>
          {MON[m - 1]} {y}
        </b>
        {next}
      </div>
      <div className="dow">
        {DOW.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="days">
        {Array.from({ length: lead }, (_, i) => (
          <i key={i} className="mk-day out" />
        ))}
        {days.map((d, i) => {
          const inside = !!lo && !!hi && d > lo && d < hi
          const edge = d === lo || d === hi
          // The ribbon runs behind the days as one band, round where a week (or the month) starts or ends inside it.
          const col = (lead + i) % 7
          const cls = [
            'mk-day',
            inside ? 'in' : '',
            edge ? 'mk-edge' : '',
            many && d === lo ? 'rs' : '',
            many && d === hi ? 're' : '',
            col === 0 || i === 0 ? 'ws' : '',
            col === 6 || i === last - 1 ? 'we' : '',
            d === today ? 'today' : '',
          ]
          return (
            <button
              key={d}
              type="button"
              data-day={d}
              tabIndex={d === focus ? 0 : -1}
              className={cls.filter(Boolean).join(' ')}
              disabled={d > today}
              aria-pressed={inside || edge}
              aria-label={d > today ? undefined : short(d)}
              onClick={() => onDay(d)}
            >
              {Number(d.slice(8))}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function Calendar({ p, onBack, onApply }: { p: PeriodChipProps; onBack: () => void; onApply: (a: ISODate, b: ISODate) => void }) {
  const [a, setA] = useState<ISODate | null>(p.customRange.from)
  const [b, setB] = useState<ISODate | null>(p.customRange.to)
  const [step, setStep] = useState<'start' | 'end'>('start')
  // A phone shows one month: the one the dates end in. Wider, two: the last of them is the end's month.
  const [cursor, setCursor] = useState<ISODate>(() => {
    const end = `${(p.customRange.to < p.today ? p.customRange.to : p.today).slice(0, 8)}01`
    const one = typeof window !== 'undefined' && window.matchMedia('(max-width: 600px)').matches
    return one ? end : addMonths(end, -1)
  })
  const [focus, setFocus] = useState<ISODate>(p.customRange.to < p.today ? p.customRange.to : p.today)
  const grid = useRef<HTMLDivElement>(null)
  // After an arrow key the day it lands on may be in a month that was just brought in: focus follows the render.
  useEffect(() => {
    if ((document.activeElement as HTMLElement | null)?.dataset.day && grid.current?.contains(document.activeElement)) grid.current.querySelector<HTMLElement>(`[data-day="${focus}"]`)?.focus()
  }, [focus, cursor])
  const onKey = (e: KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    const at = (e.target as HTMLElement).dataset.day
    if (!at || moves[e.key] === undefined) return
    e.preventDefault()
    const to = addDays(at, moves[e.key])
    if (to > p.today) return
    const month = `${to.slice(0, 8)}01`
    if (month < cursor) setCursor(month)
    else if (month > addMonths(cursor, 1)) setCursor(addMonths(month, -1))
    setFocus(to)
  }
  // The arrows beside the months: the day that takes the Tab key stays in view.
  const go = (c: ISODate) => {
    setCursor(c)
    if (focus < c || focus >= addMonths(c, 2)) setFocus(c)
  }
  const pick = (d: ISODate) => {
    setFocus(d)
    if (step === 'start') {
      setA(d)
      setB(null)
      setStep('end')
      return
    }
    const [lo, hi] = a && d < a ? [d, a] : [a ?? d, d]
    setA(lo)
    setB(hi)
    setStep('start')
    onApply(lo, hi)
  }
  const [lo, hi] = ends(a, b)
  const n = lo && hi ? diffDays(lo, hi) + 1 : 0
  return (
    <div className="cal">
      <button type="button" className="mk-back" onClick={onBack}>
        {copy.periods}
      </button>
      <div className="cf">
        <span className={`fld ${step === 'start' ? 'on' : ''}`}>
          <small>{copy.start}</small>
          {a ? short(a) : ''}
        </span>
        <span className="dash">–</span>
        <span className={`fld ${step === 'end' ? 'on' : ''}`}>
          <small>{copy.end}</small>
          {b ? short(b) : ''}
        </span>
        {n > 0 && (
          <span className="nd">
            {n} {n === 1 ? 'day' : 'days'} · {lo && hi ? p.grain(lo, hi) : 'by hour'}
          </span>
        )}
      </div>
      <p className="mk-ch">{step === 'start' ? 'Pick a start date, then an end date' : 'Now pick the end date'}</p>
      {/* Arrow keys on a day move between the days, across the months. */}
      <div className="mk-cm" role="presentation" ref={grid} onKeyDown={onKey}>
        {[cursor, addMonths(cursor, 1)].map((m) => (
          <Month
            key={m}
            first={m}
            today={p.today}
            from={a}
            to={b}
            focus={focus}
            onDay={pick}
            prev={
              <button type="button" className="mn prev" aria-label={copy.prevMonth} onClick={() => go(addMonths(cursor, -1))}>
                {'‹'}
              </button>
            }
            next={
              <button type="button" className="mn next" aria-label={copy.nextMonth} disabled={addMonths(m, 1) > p.today} onClick={() => go(addMonths(cursor, 1))}>
                {'›'}
              </button>
            }
          />
        ))}
      </div>
    </div>
  )
}

