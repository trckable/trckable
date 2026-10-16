// The period, as the header says it ("Today · Fri 16 Oct", and what it is set against), and its menu: five periods, More,
// the comparison, and a calendar for custom dates. The menu is a sheet from the bottom on a phone.
import { useState } from 'react'
import { addMonths, diffDays, type ISODate } from '../../lib/dates'
import { rangeWords } from '../dayWords'
import { copy } from '../copy'
import { useMenu } from './useMenu'

export interface PeriodOption {
  id: string
  name: string
  /** The dates it covers, said short. */
  d: string
}

export type CompareChoice = 'none' | 'previous' | 'year' | 'custom'

export interface PeriodChipProps {
  label: string
  /** What the numbers are set against, after the label ("vs usual Friday"). */
  vs?: string
  options: PeriodOption[]
  more: PeriodOption[]
  value: string
  compare: CompareChoice
  /** Last year's comparison needs a year of data. */
  yearOk: boolean
  today: ISODate
  customRange: { from: ISODate; to: ISODate }
  onPick: (id: string) => void
  onCompare: (c: CompareChoice) => void
  onRange: (from: ISODate, to: ISODate) => void
  /** The unit the chart is cut in for the chosen dates ("by hour", "by day"). */
  grain: (from: ISODate, to: ISODate) => string
}

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

function Calendar({ p, onBack, onApply }: { p: PeriodChipProps; onBack: () => void; onApply: (a: ISODate, b: ISODate) => void }) {
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

export function PeriodChip(p: PeriodChipProps) {
  const { open, attach, toggle, close } = useMenu()
  const [cal, setCal] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const opt = (o: PeriodOption) => (
    <button
      key={o.id}
      type="button"
      className={`mi ${p.value === o.id ? 'on' : ''}`}
      onClick={() => {
        p.onPick(o.id)
        close()
      }}
    >
      <span className="mt2">
        <div className="nm">{o.name}</div>
        <div className="d">{o.d}</div>
      </span>
      {p.value === o.id && (
        <svg className="ck2" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 8.5 6.5 12 13 4.5" />
        </svg>
      )}
    </button>
  )
  const cmp: { v: CompareChoice; t: string; off?: boolean; title?: string }[] = [
    { v: 'none', t: 'Off' },
    { v: 'previous', t: 'Before' },
    { v: 'year', t: 'Last year', off: !p.yearOk, title: 'Needs a year of data' },
    { v: 'custom', t: 'Custom' },
  ]
  return (
    <div className="pwrap" ref={attach}>
      <button
        type="button"
        id="perBtn"
        className="pill"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setCal(false)
          toggle()
        }}
      >
        <span>{p.label}</span>
        {p.vs && <span className="vs hide-s">{p.vs}</span>}
      </button>
      <div className={`mk-menu pmenu${open ? ' on' : ''}${cal ? ' cal' : ''}`} id="perMenu">
        {open && cal && (
          <Calendar
            p={p}
            onBack={() => setCal(false)}
            onApply={(a, b) => {
              p.onRange(a, b)
              close()
            }}
          />
        )}
        {open && !cal && (
          <>
            {p.options.map(opt)}
            <button type="button" className={`mi mk-more ${moreOpen ? 'on' : ''}`} onClick={() => setMoreOpen((o) => !o)}>
              <span className="mt2">
                <div className="nm">{copy.more}</div>
              </span>
              <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" fill="none" strokeWidth="1.6" />
              </svg>
            </button>
            {moreOpen && p.more.map(opt)}
            <div className="mk-lline" />
            <div className="mk-lopt">
              <span>{copy.compare}</span>
              <div className="mk-lseg">
                {cmp.map((c) => (
                  <button key={c.v} type="button" className={p.compare === c.v ? 'on' : ''} disabled={c.off} title={c.title} onClick={() => p.onCompare(c.v)}>
                    {c.t}
                  </button>
                ))}
              </div>
            </div>
            <div className="mk-lline" />
            <button type="button" className="mi" onClick={() => setCal(true)}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <rect x="2.5" y="3.5" width="11" height="10" rx="2" />
                <path d="M2.5 7h11M5.5 2v3M10.5 2v3" />
              </svg>
              <span className="mt2">
                <div className="nm">{copy.custom}</div>
                <div className="d">{rangeWords(p.customRange, p.today, copy.todayWord)}</div>
              </span>
            </button>
          </>
        )}
      </div>
    </div>
  )
}

