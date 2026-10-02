// The small line under the Visitors number: today against what that weekday
// usually brings ("+18% vs usual"), and, for this month, where it is heading
// ("≈ 41k by 31 Oct"). Pure, so the tile and the tests read the same rules.
import { fmtCompact, fmtInt } from '../../lib/format'

export interface Chip {
  text: string
  tone: 'up' | 'down' | 'flat'
  title: string
}

/** The server's answer to "what is usual" (server/internal/query/usual.go). */
export interface Usual {
  visitors: number
  average: number
  weeks: { day: string; visitors: number }[]
}

/** An average under this many visitors says nothing: three against two is not +50%. */
export const USUAL_FLOOR = 5
/** Within this share of usual is "about usual". */
const FLAT = 0.05

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayName = (iso: string, weekday?: 'long') =>
  new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', weekday ? { weekday, timeZone: 'UTC' } : { month: 'short', day: 'numeric', timeZone: 'UTC' })

function toneOf(d: number): Chip['tone'] {
  if (Math.abs(d) < FLAT) return 'flat'
  return d > 0 ? 'up' : 'down'
}

/** The chip for a day against its weekday's usual, or nothing when there is no usual to speak of. `day` is the day the numbers are of; `partial` says it is today so far. */
export function usualChip(u: Usual, day: string, partial: boolean): Chip | null {
  if (u.weeks.length === 0 || u.average < USUAL_FLOOR) return null
  const d = (u.visitors - u.average) / u.average
  const pct = Math.round(Math.abs(d) * 100)
  const tone = toneOf(d)
  const sign = d >= 0 ? '+' : '−'
  const week = dayName(day, 'long')
  const named = u.weeks.map((w) => dayName(w.day)).join(', ')
  const same = partial ? ', up to the same time of day' : ''
  return {
    text: `${sign}${pct}% vs usual`,
    tone,
    title: `Against the average of the last ${u.weeks.length === 1 ? week : `${u.weeks.length} ${week}s`} (${named})${same}`,
  }
}

/** The fewest days a month must have run before it has a pace: one busy first day is not a month. */
export const PACE_MIN_DAYS = 3

/** This month's visitors spread over the days it has really run, to its end; nothing before PACE_MIN_DAYS. */
export function monthPace(visitors: number, run: number, daysInMonth: number): number | null {
  if (!(run >= PACE_MIN_DAYS) || visitors <= 0) return null
  return Math.round((visitors / run) * daysInMonth)
}

export const daysInMonth = (iso: string): number => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7), 0)).getUTCDate()

/** Days the month has run at `hour` ("2026-10-02T13"): since its first day, or since `since` (the site's first day with visitors) when later. */
export function runDays(hour: string, since?: string): number {
  const start = since && since > hour.slice(0, 8) + '01' && since.slice(0, 7) === hour.slice(0, 7) ? since : hour.slice(0, 8) + '01'
  const days = (Date.parse(hour.slice(0, 10) + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86_400_000
  return days + (+hour.slice(11, 13) + 0.5) / 24
}

/** "≈ 41k by 31 Oct": a straight line from the days gone. */
export function projectionChip(visitors: number, hour: string, since?: string): Chip | null {
  const days = daysInMonth(hour)
  const run = runDays(hour, since)
  const n = monthPace(visitors, run, days)
  if (n === null) return null
  const last = `${days} ${MONTHS[+hour.slice(5, 7) - 1]}`
  return {
    text: `≈ ${fmtCompact(n)} by ${last}`,
    tone: 'flat',
    title: `At this pace: about ${fmtInt(n)} visitors by ${last}. A straight line from the ${Math.floor(run)} days so far.`,
  }
}
