// A site whose first visit falls inside the period: its chart and the tiles'
// small lines start at that visit, not at a month of zeros. No React, so the
// rules are tested on their own (firstVisit.test.ts).
import { diffDays } from '../../lib/dates'

/**
 * The first bucket with a visit, when the site's first visit falls inside
 * the period: nothing at all in the period just before it, nothing filtered
 * (a filter can hide the early days of a site that was there all along).
 * 0 otherwise, meaning the whole period.
 */
export function firstVisitAt(values: number[], before: number | undefined, filtered: boolean): number {
  if (filtered || before === undefined || before > 0) return 0
  const i = values.findIndex((v) => v > 0)
  return i > 0 ? i : 0
}

/** A span this short drawn by day is two or three points, a triangle: it is
 *  drawn by the hour instead. */
export const hourlySpan = (from: string, to: string) => diffDays(from, to) <= 2

/** The hour it is now where the site is, as the chart labels hours:
 *  "2026-09-28T14". Hours after it have not happened yet. */
export function hourIn(tz: string, now = new Date()): string {
  try {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]))
    return `${p.year}-${p.month}-${p.day}T${p.hour}`
  } catch {
    return now.toISOString().slice(0, 13)
  }
}
