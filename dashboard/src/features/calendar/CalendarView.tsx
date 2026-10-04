// The Data view's calendar: a month of days, each tinted by how busy it was,
// with the moments and notes of the day and, for days to come, what the
// weekday usually brings and the plans made. One request for the whole month
// (useCalMonth). Clicking a day opens its card; the arrow keys move between
// days. The month and the day live in the address (url.ts).
import { ChevronLeft, ChevronRight, Info } from 'lucide-react'
import { useMemo, useRef } from 'react'
import { Ghost } from '../../components/Logo'
import { Loading } from '../../components/loading/Loading'
import { fmtInt } from '../../lib/format'
import { monthLong, monthGrid } from '../../lib/dates'
import { setView } from '../../lib/url'
import { Cell } from './Cell'
import type { CalendarSlotProps } from './CalendarSlot'
import { copy } from './copy'
import { DayCard } from './DayCard'
import { heatCap, heatOf, momentsByDay, monthOf, monthStep, notesByDay, stepDay, weekdayHeader } from './model'
import { useCalMonth } from './useCalMonth'
import './Calendar.css'

export default function CalendarView(p: CalendarSlotProps) {
  const month = monthOf(p.cal, p.periodEnd)
  const { data, loading, failed, reload } = useCalMonth(p.site, month, p.filters, p.test)
  const grid = useRef<HTMLDivElement>(null)
  const picked = p.cal.length === 10 && p.cal.slice(0, 7) === month ? p.cal : undefined
  const model = useMemo(() => {
    if (!data) return null
    return { by: new Map(data.days.map((d) => [d.day, d])), moments: momentsByDay(data.moments), notes: notesByDay(data.notes), cap: heatCap(data.days, data.today) }
  }, [data])
  const go = (to: string) => setView({ cal: to })
  const pick = (day: string) => setView({ cal: day })
  const openDay = (day: string) => setView({ cal: undefined, period: 'custom', from: day, to: day, day: undefined, bucket: undefined })
  const changed = () => {
    reload()
    p.onChanged()
  }
  const year = month.slice(0, 4)
  const name = monthLong[Number(month.slice(5)) - 1] + ' ' + year
  const shown = data && model && data.month === month ? { data, model } : null
  const tab = picked ?? (shown && shown.data.today.slice(0, 7) === month ? shown.data.today : month + '-01')
  const onKey = (e: React.KeyboardEvent) => {
    const day = (e.target as HTMLElement).closest<HTMLElement>('[data-day]')?.dataset.day
    if (!day) return
    const next = stepDay(day, e.key, month)
    if (next === day) return
    e.preventDefault()
    grid.current?.querySelector<HTMLElement>(`[data-day="${next}"]`)?.focus()
  }
  const dayOf = picked && shown?.model.by.get(picked)
  const empty = shown && !shown.data.days.some((d) => d.visitors > 0)
  return (
    <div className="cal" aria-busy={loading || undefined}>
      <div className="cal-head">
        <button type="button" className="btn icon ghost" aria-label={copy.prev} onClick={() => go(monthStep(month, -1))}>
          <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
        </button>
        <h3 className="cal-title">{name}</h3>
        <button type="button" className="btn icon ghost" aria-label={copy.next} onClick={() => go(monthStep(month, 1))}>
          <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
        </button>
        {shown?.data.filtered && (
          <span className="cal-info" title={copy.wholeSite} role="img" aria-label={copy.wholeSite}>
            <Info size={14} strokeWidth={2} aria-hidden="true" />
          </span>
        )}
      </div>
      {failed && (
        <button type="button" className="faint cal-failed" onClick={reload}>
          {copy.failed}
        </button>
      )}
      {!shown && !failed && <Loading height={420} />}
      {shown && (
        <div ref={grid} className="cal-grid" role="grid" tabIndex={-1} aria-label={copy.label + ' ' + name} onKeyDown={onKey}>
          <div className="cal-row cal-weekdays" role="row">
            {weekdayHeader(shown.data.weekday_avg).map((w) => (
              <span key={w.name} role="columnheader" className="cal-wd" aria-label={copy.weekdayAvg(w.name, fmtInt(w.avg))}>
                {w.name}
                <b className="num">{w.avg > 0 ? fmtInt(w.avg) : ''}</b>
              </span>
            ))}
          </div>
          {monthGrid(month + '-01').map((week, i) => (
            <div key={i} className="cal-row" role="row">
              {week.map((d, j) => {
                const day = d && shown.model.by.get(d)
                if (!day) return <span key={j} className="cal-pad" role="gridcell" aria-hidden="true" />
                const money = shown.data.currency ? { currency: shown.data.currency, exponent: shown.data.exponent ?? 2 } : undefined
                return (
                  <Cell key={j} day={day} today={shown.data.today} heat={heatOf(day.visitors, shown.model.cap)} moments={shown.model.moments.get(d) ?? []} notes={shown.model.notes.get(d) ?? []} selected={d === picked} tab={d === tab} plans={p.plans} money={money} onPick={pick} />
                )
              })}
            </div>
          ))}
          {empty && (
            <p className="cal-empty faint">
              <Ghost size={40} />
              {copy.empty}
            </p>
          )}
        </div>
      )}
      {shown && dayOf && (
        <DayCard key={dayOf.day} site={p.site} day={dayOf} month={shown.data} moments={shown.model.moments.get(dayOf.day) ?? []} notes={shown.model.notes.get(dayOf.day) ?? []} plans={p.plans} onClose={() => go(month)} onOpenDay={openDay} onChanged={changed} />
      )}
    </div>
  )
}
