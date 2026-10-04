import { defineCopy, tag } from '../../i18n'
// The small chip after the Visitors change: today (or yesterday) against what
// that weekday usually brings ("+18% vs usual"). Pure, so the tile and the tests
// read the same rules. Where this month is heading is the Visitors tile's pace line
// (features/extras/PaceLine), which already says it.

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

// The chip against the weekday's usual: "+18% vs usual", and what it was measured against.
const words = defineCopy('overview.hint', {
  text: (sign: string, pct: number) => `${sign}${pct}% vs usual`,
  one: (week: string, named: string, same: boolean) => `Against the average of the last ${week} (${named})${same ? ', up to the same time of day' : ''}`,
  many: (n: number, week: string, named: string, same: boolean) => `Against the average of the last ${n} ${week}s (${named})${same ? ', up to the same time of day' : ''}`,
})

const dayName = (iso: string, weekday?: 'long') =>
  new Date(iso + 'T12:00:00Z').toLocaleDateString(tag ?? 'en-US', weekday ? { weekday, timeZone: 'UTC' } : { month: 'short', day: 'numeric', timeZone: 'UTC' })

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
  return {
    text: words.text(sign, pct),
    tone,
    title: u.weeks.length === 1 ? words.one(week, named, partial) : words.many(u.weeks.length, week, named, partial),
  }
}
