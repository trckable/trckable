// A period at a glance: one cell per day we were watching, coloured by the worst incident that touched it (days before the
// watch began are not drawn, they are not "no incident"). A short period is a strip; a year is a calendar grid (a column a
// week). Each day says its details on hover; the legend names the three colours.
import { useMemo } from 'react'
import { Tooltip } from '../../kit'
import { fmtDay } from '../../lib/dates'
import type { Incident } from './api'
import { copy } from './copy'
import { dayLasted, dayStates, daysBetween, duration, type DayState } from './model'

/** From this many days on, the strip becomes the year's grid. */
export const GRID_FROM = 120

const say: Record<Exclude<DayState, 'unwatched'>, (day: string, span: string) => string> = { ok: copy.dayOk, quiet: copy.dayQuiet, down: copy.dayDown }

export function Timeline({ list, from, to, tz, now, watchedSince = 0, since }: { list: Incident[]; from: string; to: string; tz: string; now: number; watchedSince?: number; since?: string }) {
  const watched = useMemo(() => {
    const states = dayStates(list, daysBetween(from, to), tz, now, watchedSince)
    return [...states].filter(([, s]) => s !== 'unwatched')
  }, [list, from, to, tz, now, watchedSince])
  if (watched.length === 0) return null
  const grid = watched.length >= GRID_FROM
  // The grid starts on a Monday: blank cells fill the first week.
  const lead = grid ? (new Date(watched[0][0] + 'T00:00:00Z').getUTCDay() + 6) % 7 : 0
  return (
    <section className="inc-timeline" aria-label={grid ? copy.year : copy.strip}>
      <div className={grid ? 'inc-days grid' : 'inc-days strip'} role="img" aria-label={grid ? copy.year : copy.strip}>
        {Array.from({ length: lead }, (_, i) => (
          <i key={`b${i}`} className="blank" />
        ))}
        {watched.map(([d, state], n) => {
          const k = state as Exclude<DayState, 'unwatched'>
          const text = say[k](fmtDay(d, { year: true }), k === 'ok' ? '' : duration(dayLasted(list, d, tz, now)))
          return (
            <Tooltip key={d} text={text} align={n > watched.length / 2 ? 'right' : 'left'}>
              {(p) => <i className={state} {...p} />}
            </Tooltip>
          )
        })}
      </div>
      <div className="inc-foot">
        <ul className="inc-legend" aria-hidden="true">
          <li className="ok">{copy.legendOk}</li>
          <li className="quiet">{copy.legendQuiet}</li>
          <li className="down">{copy.legendDown}</li>
        </ul>
        {since && <small>{copy.since(since)}</small>}
      </div>
    </section>
  )
}
