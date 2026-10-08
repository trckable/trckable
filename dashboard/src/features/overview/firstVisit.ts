// What the overview works out about its periods: whether the period before is
// there in full, how short a span is drawn by the hour, and the hour it is now.
// No React, so the rules are tested on their own (firstVisit.test.ts).
import { diffDays } from '../../lib/dates'
import type { KPIs, Result } from '../../lib/api'
import { copy } from './copy'
import { baseEnough, tooFew } from '../../lib/thin'

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

/** Why no change is shown against the period before, when there are visits before and still no change is told. */
export type NoChange = { why: 'days'; n: number } | { why: 'few'; n: number }

/**
 * The period before as a base for a change: usable when it is there in full
 * (previousWhole) and has enough visitors (lib/thin). Otherwise why not, so
 * the page can say so instead of showing nothing; null when it is usable or
 * had no visits at all (nothing to say then).
 */
export function noChangeWhy(visitors: number, values: number[], bucket: 'hour' | 'day' | 'week' | 'month'): NoChange | null {
  if (visitors <= 0) return null
  if (!previousWhole(values, bucket)) {
    const first = values.findIndex((v) => v > 0)
    return { why: 'days', n: values.length - Math.max(first, 0) }
  }
  return baseEnough(visitors) ? null : { why: 'few', n: visitors }
}

/** Why no change is told against the period before, from the report itself, as the line the page says; empty when it can carry one, or when `on` is false (a picked day, a followed channel, no comparison asked). */
export function noChangeLine(on: boolean, before: Result | undefined, bucket: 'hour' | 'day' | 'week' | 'month'): string {
  // Nothing at all before: said too, so a comparison that is on never shows silently nothing.
  if (on && before && before.kpis.visitors <= 0) return copy.noChangeNone
  const why = on && before ? noChangeWhy(before.kpis.visitors, before.series.map((p) => p.visitors), bucket) : null
  if (!why) return ''
  return why.why === 'days' ? copy.noChangeDays(why.n) : copy.noChangeFew(why.n)
}

/** Whether the whole period has too few visits for a rate or an average: only the whole period, never a picked day or a followed channel. */
export const thinPeriod = (k: KPIs | undefined, narrowed: boolean) => !narrowed && !!k && tooFew(k.sessions)

/** Whether the period before can carry a change: it had visits, is there in full and has enough visitors. */
export const canCompare = (before: Result | undefined, bucket: 'hour' | 'day' | 'week' | 'month') =>
  !!before && before.kpis.sessions > 0 && noChangeWhy(before.kpis.visitors, before.series.map((p) => p.visitors), bucket) === null
