// A period at a glance: one cell per day, coloured by the worst incident that
// touched it. A short period is a strip; a year is a calendar grid (a column a
// week, like a contributions grid). The list below says the same in words.
import { useMemo } from 'react'
import { Tooltip } from '../../kit'
import { fmtDay } from '../../lib/dates'
import { fmtSpan } from '../../lib/format'
import type { Incident } from './api'
import { copy } from './copy'
import { dayLasted, dayStates, daysBetween, type DayState } from './model'

/** From this many days on, the strip becomes the year's grid. */
export const GRID_FROM = 120

const say: Record<DayState, (day: string, span: string) => string> = { ok: copy.dayOk, quiet: copy.dayQuiet, down: copy.dayDown, unwatched: copy.dayUnwatched }

export function Timeline({ list, from, to, tz, now, watchedSince = 0 }: { list: Incident[]; from: string; to: string; tz: string; now: number; watchedSince?: number }) {
  const days = useMemo(() => daysBetween(from, to), [from, to])
  const states = useMemo(() => dayStates(list, days, tz, now, watchedSince), [list, days, tz, now, watchedSince])
  const grid = days.length >= GRID_FROM
  // The grid starts on a Monday: blank cells fill the first week.
  const lead = grid ? (new Date(days[0] + 'T00:00:00Z').getUTCDay() + 6) % 7 : 0
  return (
    <section className="inc-timeline" aria-label={grid ? copy.year : copy.strip}>
      <div className={grid ? 'inc-days grid' : 'inc-days strip'} role="img" aria-label={grid ? copy.year : copy.strip}>
        {Array.from({ length: lead }, (_, i) => (
          <i key={`b${i}`} className="blank" />
        ))}
        {days.map((d, n) => {
          const state = states.get(d) ?? 'ok'
          const text = say[state](fmtDay(d, { year: true }), state === 'ok' || state === 'unwatched' ? '' : fmtSpan(dayLasted(list, d, tz, now)))
          return (
            <Tooltip key={d} text={text} align={n > days.length / 2 ? 'right' : 'left'}>
              {(p) => <i className={state} {...p} />}
            </Tooltip>
          )
        })}
      </div>
      <ul className="inc-legend" aria-hidden="true">
        <li className="ok">{copy.legendOk}</li>
        <li className="quiet">{copy.legendQuiet}</li>
        <li className="down">{copy.legendDown}</li>
        {[...states.values()].includes('unwatched') && <li className="unwatched">{copy.legendUnwatched}</li>}
      </ul>
    </section>
  )
}
