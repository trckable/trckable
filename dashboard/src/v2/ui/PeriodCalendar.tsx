// The calendar behind "Custom dates": two months, a first and a last day picked in turn, and the unit the chart is cut in.
import { useState } from 'react'
import { addMonths, diffDays, type ISODate } from '../../lib/dates'
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

function Month({ first, today, from, to, onDay }: { first: ISODate; today: ISODate; from: ISODate | null; to: ISODate | null; onDay: (d: ISODate) => void }) {
  const [y, m] = first.split('-').map(Number)
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const days = Array.from({ length: last }, (_, i) => `${first.slice(0, 8)}${String(i + 1).padStart(2, '0')}`)
  return (
    <div className="month">
      <div className="mth">
        <b>
          {MON[m - 1]} {y}
        </b>
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
        {days.map((d) => {
          const [lo, hi] = ends(from, to)
          const inside = !!lo && !!hi && d > lo && d < hi
          const edge = d === lo || d === hi
          return (
            <button key={d} type="button" className={`mk-day ${inside ? 'in' : ''} ${edge ? 'mk-edge' : ''} ${d === today ? 'today' : ''}`} disabled={d > today} aria-label={d > today ? undefined : short(d)} onClick={() => onDay(d)}>
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
  const [cursor, setCursor] = useState<ISODate>(addMonths(p.today.slice(0, 8) + '01', -1))
  const pick = (d: ISODate) => {
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
      <div className="mk-cm">
        {[cursor, addMonths(cursor, 1)].map((m, i) => (
          <div key={m}>
            <div className="mth">
              {i === 0 && (
                <button type="button" className="mn prev" aria-label={copy.prevMonth} onClick={() => setCursor(addMonths(cursor, -1))}>
                  {'‹'}
                </button>
              )}
              <b>
                {MON[Number(m.slice(5, 7)) - 1]} {m.slice(0, 4)}
              </b>
              {i === 1 && (
                <button type="button" className="mn next" aria-label={copy.nextMonth} disabled={addMonths(m, 1) > p.today} onClick={() => setCursor(addMonths(cursor, 1))}>
                  {'›'}
                </button>
              )}
            </div>
            <Month first={m} today={p.today} from={a} to={b} onDay={pick} />
          </div>
        ))}
      </div>
    </div>
  )
}

