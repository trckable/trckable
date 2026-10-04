// A day's story, on the side card: its visitors and what they did against the
// usual, where they came from, the sales, the moments with their hours, the
// notes and plans, the day by the hour, and a way into the day itself.
import { CalendarDays } from 'lucide-react'
import { useState } from 'react'
import { cardModal } from '../../components/CardModal/copy'
import { SideCard } from '../../components/SideCard/SideCard'
import { dayShort, fmtDay, toDate } from '../../lib/dates'
import { fmtInt, fmtMoney } from '../../lib/format'
import { channelLabel } from '../../lib/palette'
import type { Annotation } from '../../lib/api'
import { copy } from './copy'
import DayModal from './DayModal'
import { HourStrip } from './HourStrip'
import { hourOf, momentText, MomentIcon } from './icons'
import { signed } from './Cell'
import { PlanForm } from './PlanForm'
import { changeVs, type CalDay, type CalMoment, type CalMonth } from './model'

export interface DayCardProps {
  site: string
  day: CalDay
  month: CalMonth
  moments: CalMoment[]
  notes: Annotation[]
  plans: boolean
  onClose: () => void
  onOpenDay: (day: string) => void
  onChanged: () => void
}

export function DayCard({ site, day, month, moments, notes, plans, onClose, onOpenDay, onChanged }: DayCardProps) {
  const [open, setOpen] = useState(false)
  const { today } = month
  const future = day.day > today
  const change = changeVs(day, today)
  const money = { currency: month.currency ?? 'USD', exponent: month.exponent ?? 2 }
  const planned = notes.filter((n) => n.planned)
  const plain = notes.filter((n) => !n.planned)
  const weekday = dayShort[(toDate(day.day).getUTCDay() + 6) % 7]
  return (
    <>
      <SideCard
        id="calendar-day"
        asked
        label={fmtDay(day.day, { weekday: true, year: true })}
        closeLabel={copy.close}
        kind={{ icon: <CalendarDays size={14} strokeWidth={2} />, label: fmtDay(day.day, { weekday: true }) }}
        title={
          <span className="side-num num">{future ? copy.expected(fmtInt(day.usual)) : fmtInt(day.visitors)}</span>
        }
        onClose={onClose}
        chart={!future && day.hours ? <HourStrip hours={day.hours} /> : undefined}
        actions={
          !future && (
            <button type="button" className="btn primary" aria-haspopup="dialog" onClick={() => setOpen(true)}>
              {cardModal.details}
            </button>
          )
        }
      >
        {!future && (
          <div className="side-sub">
            {change !== null && <span className={change < 0 ? 'side-mult down num' : 'side-mult num'}>{signed(change)}</span>}
            {day.usual > 0 && <span className="muted num">{copy.usual(fmtInt(day.usual))}</span>}
          </div>
        )}
        {planned.length > 0 && change !== null && <p className="cal-score-line num">{copy.vsUsual(signed(change), weekday)}</p>}
        <ul className="cal-facts">
          {day.source && (
            <li>
              <span>{copy.source}</span>
              <b>{channelLabel(day.source)}</b>
            </li>
          )}
          {day.page && (
            <li>
              <span>{copy.page}</span>
              <b>{day.page}</b>
            </li>
          )}
          {day.sales ? (
            <li>
              <span>{copy.sales(day.sales)}</span>
              <b className="num cal-rev">{fmtMoney(day.revenue ?? 0, money.currency, money.exponent)}</b>
            </li>
          ) : null}
          {moments.map((m, i) => (
            <li key={i}>
              <span className="cal-moment">
                <MomentIcon kind={m.kind} size={13} />
                {momentText(m, month)}
              </span>
              {hourOf(m) && <b className="num muted">{hourOf(m)}</b>}
            </li>
          ))}
        </ul>
        {plain.map((n) => (
          <span key={n.id} className="cal-chip wide">
            {n.text}
          </span>
        ))}
        {plans && day.day >= today ? <PlanForm site={site} day={day.day} plans={planned} onChanged={onChanged} /> : planned.map((n) => <span key={n.id} className="cal-chip plan wide">{n.text}</span>)}
      </SideCard>
      {open && <DayModal day={day} month={month} moments={moments} onClose={() => setOpen(false)} onOpen={() => onOpenDay(day.day)} />}
    </>
  )
}
