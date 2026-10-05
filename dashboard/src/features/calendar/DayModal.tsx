// The dialog behind a day's card: the day told in full. Its visitors against the usual, the day by
// the hour as a line, where they came from, the sales, the moments with their hours, and the way
// into the day itself.
import { CalendarDays } from 'lucide-react'
import { CardModal } from '../../components/CardModal/CardModal'
import { cardModal } from '../../components/CardModal/copy'
import { busiest, Meaning, Part, Spark } from '../../components/CardModal/parts'
import { dayShort, fmtDay, toDate } from '../../lib/dates'
import { fmtInt, fmtMoney } from '../../lib/format'
import { channelLabel } from '../../lib/palette'
import { signed } from './Cell'
import { copy } from './copy'
import { hourOf, momentText, MomentIcon } from './icons'
import { changeVs, type CalDay, type CalMoment, type CalMonth } from './model'

export default function DayModal({ day, month, moments, onClose, onOpen }: { day: CalDay; month: CalMonth; moments: CalMoment[]; onClose: () => void; onOpen: () => void }) {
  const change = changeVs(day, month.today)
  const weekday = dayShort[(toDate(day.day).getUTCDay() + 6) % 7]
  const money = { currency: month.currency ?? 'USD', exponent: month.exponent ?? 2 }
  const hours = day.hours ?? []
  return (
    <CardModal
      label={fmtDay(day.day, { weekday: true, year: true })}
      kind={{ icon: <CalendarDays size={14} strokeWidth={2} />, label: fmtDay(day.day, { weekday: true }) }}
      title={
        <>
          {fmtInt(day.visitors)}
          {change !== null && <small className="num">{signed(change)}</small>}
          {day.usual > 0 && <small className="num">{copy.usual(fmtInt(day.usual))}</small>}
        </>
      }
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            {cardModal.close}
          </button>
          <button type="button" className="btn primary" onClick={onOpen}>
            {copy.openDay}
          </button>
        </>
      }
    >
      {hours.length > 1 && (
        <Part title={copy.byHour}>
          <Spark values={hours} hl={busiest(hours)} label={copy.byHour} />
        </Part>
      )}
      <Part title={fmtDay(day.day)}>
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
      </Part>
      {change !== null && <Meaning>{copy.vsUsual(signed(change), weekday)}</Meaning>}
    </CardModal>
  )
}
