// One day of the month grid. A finished day shows its visitors, what it did
// against its usual, its money, the shape of its hours, the moments of the
// day and its notes; a day to come shows what the weekday usually brings and
// a plus for a plan. Its tint is its heat. On a phone it shrinks to the
// number and dots (Calendar.css).
import { Clock, Plus } from 'lucide-react'
import type { Annotation } from '../../lib/api'
import { sparkPoints, SPARK_H, SPARK_W } from '../../charts/sparkPath'
import { dayShort, fmtDay, toDate } from '../../lib/dates'
import { fmtInt, fmtMoney } from '../../lib/format'
import { copy } from './copy'
import { MomentIcon, tintOf } from './icons'
import { changeVs, type CalDay, type CalMoment } from './model'

export interface CellProps {
  day: CalDay
  today: string
  heat: number
  moments: CalMoment[]
  notes: Annotation[]
  selected: boolean
  tab: boolean
  plans: boolean
  money?: { currency: string; exponent: number }
  onPick: (day: string) => void
}

/** "+34%" or "−19%", the way a change reads everywhere else. */
export function signed(pct: number): string {
  const sign = pct > 0 ? '+' : ''
  return `${pct < 0 ? '\u2212' : sign}${Math.abs(pct)}%`
}

/** The short weekday name of a day. */
const weekdayOf = (day: string) => dayShort[(toDate(day).getUTCDay() + 6) % 7]

export function Cell({ day, today, heat, moments, notes, selected, tab, plans, money, onPick }: CellProps) {
  const future = day.day > today
  const change = changeVs(day, today)
  const num = Number(day.day.slice(8))
  const plan = notes.find((n) => n.planned)
  const plain = notes.filter((n) => !n.planned)
  const label = fmtDay(day.day, { weekday: true })
  const aria = future ? copy.dayLabelLater(label, fmtInt(day.usual)) : copy.dayLabel(label, fmtInt(day.visitors))
  const cls = ['cal-cell', future && 'future', day.day === today && 'today', selected && 'on', !future && day.visitors === 0 && 'quiet'].filter(Boolean).join(' ')
  return (
    <button type="button" role="gridcell" className={cls} style={{ ['--h' as string]: future ? 0 : heat }} data-day={day.day} tabIndex={tab ? 0 : -1} aria-selected={selected} aria-label={aria} onClick={() => onPick(day.day)}>
      <span className="cal-top">
        <span className="cal-d num">{num}</span>
        {change !== null && <span className={change < 0 ? 'cal-chg down num' : 'cal-chg up num'}>{signed(change)}</span>}
      </span>
      {future ? (
        <span className="cal-v cal-soon num">{day.usual > 0 && copy.expected(fmtInt(day.usual))}</span>
      ) : (
        <span className="cal-mid">
          <b className="cal-v num">{fmtInt(day.visitors)}</b>
          {day.revenue ? <span className="cal-rev num">{fmtMoney(day.revenue, money?.currency ?? 'USD', money?.exponent ?? 2)}</span> : null}
        </span>
      )}
      {!future && day.hours && day.visitors > 0 && (
        <svg className="cal-spark" viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none" aria-hidden="true">
          <polyline points={sparkPoints(day.hours)} />
        </svg>
      )}
      {moments.length > 0 && (
        <span className="cal-moments">
          {moments.slice(0, 4).map((m, i) => (
            <span key={i} className="cal-ic" title={copy.kind[m.kind]}>
              <MomentIcon kind={m.kind} />
              <i className="cal-dot" style={{ background: tintOf(m.kind) }} />
            </span>
          ))}
        </span>
      )}
      {plain[0] && <span className="cal-chip">{plain[0].text}</span>}
      {plan && (
        <span className="cal-chip plan">
          <Clock size={10} strokeWidth={2} aria-hidden="true" />
          {plan.text}
        </span>
      )}
      {plan && !future && change !== null && <span className={change < 0 ? 'cal-score down num' : 'cal-score up num'}>{copy.vsUsual(signed(change), weekdayOf(day.day))}</span>}
      {future && plans && <Plus className="cal-plus" size={16} strokeWidth={1.75} aria-hidden="true" />}
    </button>
  )
}
