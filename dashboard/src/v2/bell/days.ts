// The bell's days: the rows are listed under "Today", "Yesterday" and "Tue 20 Oct", each row with only its time. The day
// is the viewer's own (their zone, not UTC). Pure; `now` and `zone` are for tests.
import { dayWords } from '../dayWords'
import { dateFmt } from '../../lib/format'
import { clock } from '../../lib/site'
import { copy } from './copy'

/** The calendar day ("2026-10-20") of a moment in a zone (the viewer's own when none is given). */
export function dayOf(at: number, zone?: string): string {
  return dateFmt('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: zone }).format(new Date(at * 1000))
}

/** The clock of a moment as the app writes it everywhere ("09:10"), in the viewer's zone. */
export const timeOf = (at: number, zone?: string): string => clock(new Date(at * 1000), zone ?? '')

/** The heading of a day: the word for today and yesterday, else the date. */
const headingOf = (day: string, today: string, yesterday: string): string => {
  if (day === today) return copy.today
  return day === yesterday ? copy.yesterday : dayWords(day)
}

const before = (day: string): string => new Date(Date.parse(day + 'T12:00:00Z') - 86_400_000).toISOString().slice(0, 10)

/** When a moment was, as a sentence says it: "today 19:10", "yesterday 08:05", "Tue 20 Oct 19:10". */
export function whenOf(at: number, now = Date.now() / 1000, zone?: string): string {
  const today = dayOf(now, zone)
  const day = dayOf(at, zone)
  const head = headingOf(day, today, before(today))
  return `${day === today || day === before(today) ? head.toLowerCase() : head} ${timeOf(at, zone)}`
}

export interface Day<T> {
  day: string
  label: string
  rows: T[]
}

/** The rows (newest first) under their days, in the order given: "Today", "Yesterday", then the date. */
export function byDay<T extends { at: number }>(rows: readonly T[], now = Date.now() / 1000, zone?: string): Day<T>[] {
  const today = dayOf(now, zone)
  const yesterday = before(today)
  const out: Day<T>[] = []
  for (const r of rows) {
    const day = dayOf(r.at, zone)
    const last = out[out.length - 1]
    if (last && last.day === day) last.rows.push(r)
    else out.push({ day, label: headingOf(day, today, yesterday), rows: [r] })
  }
  return out
}
