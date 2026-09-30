// What the overview works out about its periods: whether the period before is
// there in full, how short a span is drawn by the hour, and the hour it is now.
// No React, so the rules are tested on their own (firstVisit.test.ts).
import { diffDays } from '../../lib/dates'

/**
 * Whether the period before this one is there in full, so a change against it
 * means something: a site that began inside it has empty buckets at its start
 * (the tiles would say +2,585% for a month against three days of it), and a
 * period with no visit at all has nothing to compare with. By the hour a quiet
 * night is not a young site, so only the days, weeks and months are asked.
 */
export function previousWhole(values: number[], bucket: 'hour' | 'day' | 'week' | 'month'): boolean {
  const first = values.findIndex((v) => v > 0)
  if (first < 0) return false
  return bucket === 'hour' || first < Math.max(2, Math.ceil(values.length * 0.1))
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
