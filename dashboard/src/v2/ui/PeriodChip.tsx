// The period, as the header says it ("Today · Fri 16 Oct", and what it is set against), and its menu: five periods, More,
// the comparison, and a calendar for custom dates. The menu is a sheet from the bottom on a phone.
import { useState } from 'react'
import type { ISODate } from '../../lib/dates'
import { rangeWords } from '../dayWords'
import { copy } from '../copy'
import { Calendar } from './PeriodCalendar'
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

