// The bell's days: the rows are listed under "Today", "Yesterday" and "Tue 20 Oct", each row with only its time. The day
// is a day of the site's zone (the viewer's own when there is none). Pure; `now` is for tests.
import { dayWords } from '../dayWords'
import { browserZone, dateFmt } from '../../lib/format'
import { clock } from '../../lib/site'
import { copy } from './copy'

/** The calendar day ("2026-10-20") of a moment in a zone (the viewer's own when none is given). */
export function dayOf(at: number, zone?: string): string {
  return dateFmt('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: zone || undefined }).format(new Date(at * 1000))
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
  /** The zone its times are written in, when that is not the viewer's own: told once, under the heading. */
  zone?: string
  rows: T[]
}

/** The rows (newest first) under their days, in the order given: "Today", "Yesterday", then the date. A row's day is a day of its own zone (one zone for all, or a function of the row; else the viewer's), so rows of sites in different zones sit under their own days. */
export function byDay<T extends { at: number }>(rows: readonly T[], now = Date.now() / 1000, zone?: string | ((r: T) => string | undefined)): Day<T>[] {
  const mine = browserZone()
  const out: Day<T>[] = []
  for (const r of rows) {
    const z = typeof zone === 'function' ? zone(r) : zone
    const shown = z && z !== mine ? z : undefined
    const today = dayOf(now, z)
    const day = dayOf(r.at, z)
    const last = out[out.length - 1]
    if (last && last.day === day && last.zone === shown) last.rows.push(r)
    else out.push({ day, label: headingOf(day, today, before(today)), zone: shown, rows: [r] })
  }
  return out
}
