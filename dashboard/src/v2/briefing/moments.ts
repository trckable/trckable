// The hero's quiet extras: a pill when the day is a record, and one when several days in a row ran above their usual.
// From the last 90 days of daily visitors only, so it is pure and says nothing it cannot back. Pure: moments.test.ts.
import { dayWords } from '../dayWords'
import { copy } from './copy'
import { dayBandOf } from './usual'

export interface MomentsIn {
  /** Visitors per day, oldest first, the last being today (so far). */
  totals: number[]
  /** The day of each total, "2026-10-16". */
  days: string[]
  /** Today so far is above what a usual day brings by now. */
  todayUp: boolean
  /** The period's days (inclusive), as they sit in `days`. */
  from: number
  to: number
  /** Minutes of today that have passed, in the site's own time. */
  elapsed: number
  today: boolean
  week: boolean
  /** A filter narrows the numbers: then neither says anything. */
  filtered: boolean
}

export interface Moments {
  pills: string[]
  line: string
}

/** How many days in a row (ending yesterday) ran above their usual band. */
export function streak(totals: number[], days: string[], last: number): number {
  let n = 0
  for (let d = last; d >= Math.max(0, last - 30); d--) {
    const b = dayBandOf(totals, days, d)
    if (b && totals[d] > b.hi) n++
    else break
  }
  return n
}

export function moments(o: MomentsIn): Moments {
  const out: Moments = { pills: [], line: '' }
  const end = o.totals.length - 1
  if (o.filtered || end < 30) return out
  let rec = -1
  if (o.today) {
    if (o.elapsed >= 360 && o.totals[end] > Math.max(...o.totals.slice(0, end))) rec = end
  } else {
    for (let d = Math.min(end - 1, o.to); d >= Math.max(30, o.from); d--) {
      if (d >= end - 13 && o.totals[d] > Math.max(...o.totals.slice(0, d)) * 1.03) {
        rec = d
        break
      }
    }
  }
  if (rec >= 0) {
    out.pills.push(copy.recordDay)
    out.line = rec === end ? copy.busiestOngoing : copy.busiest(dayWords(o.days[rec]))
  }
  const n = streak(o.totals, o.days, end - 1) + (o.todayUp ? 1 : 0)
  if ((o.today || o.week) && n >= 3) out.pills.push(o.todayUp ? copy.nthDay(n) : copy.daysAbove(n))
  return out
}
