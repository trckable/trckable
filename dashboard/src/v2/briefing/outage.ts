// The timeline of the incident card: the stretches the site did not answer, as shares of the period (0 at its first
// midnight, 1 at its last), so a day-long look and a month-long look draw the red where it really was. Pure: outage.test.ts.
import { addDays, diffDays } from '../../lib/dates'

export interface Span {
  a: number
  b: number
}

const DAY = 86400

/** Where the period ends, in seconds: the end of its last day, however many days it counts and whether or not it reaches now. */
export const periodEnd = (from0: number, from: string, to: string): number => from0 + (diffDays(from, to) + 1) * DAY

const share = (t: number, from0: number, end: number): number => Math.min(1, Math.max(0, (t - from0) / (end - from0)))

/** One red stretch per incident that touches the period (one still going ends at `now`), and where now is on the line. */
export function outageSpans(list: { started_at: number; ended_at: number | null }[], from0: number, end: number, now: number): { spans: Span[]; nowAt: number } {
  const spans = list.flatMap((x) => {
    const a = share(x.started_at, from0, end)
    const b = share(x.ended_at ?? now, from0, end)
    return b > a ? [{ a, b }] : []
  })
  return { spans, nowAt: share(now, from0, end) }
}

/** Seconds of one outage inside [from, to] (an outage still going ends at `now`): the part before the period or after it is not counted. */
export const insideSeconds = (x: { started_at: number; ended_at: number | null }, from: number, to: number, now: number): number =>
  Math.max(0, Math.min(x.ended_at ?? now, to) - Math.max(x.started_at, from))

/** Seconds the site was down inside [from, to], from one list: the one rule the headline, the score and the line under the headline all use. */
export const downSeconds = (list: { started_at: number; ended_at: number | null }[], from: number, to: number, now: number): number =>
  list.reduce((n, x) => n + insideSeconds(x, from, to, now), 0)

/** After this long back up, the incident card is no longer in the tone of bad news. */
export const CALM_AFTER = 6 * 3600

/** What the incident card's line needs: the latest outage's own day (00:00 to the end of it, or to now while it is today), each stretch of that day with its times and minutes, and whether the site has been up for a while. */
export function incidentDay(
  list: { started_at: number; ended_at: number | null }[],
  o: { now: number; fallbackDay: string; dayOf: (t: number) => string; startOf: (day: string) => number; clock: (t: number) => string },
): { spans: Span[]; nowAt: number; from: string; now: string; live: boolean; marks: { a: number; b: number; from: string; to: string; min: number }[]; calm: boolean } {
  const latest = list.reduce<{ started_at: number; ended_at: number | null } | null>((best, x) => (!best || x.started_at > best.started_at ? x : best), null)
  const day = latest ? o.dayOf(latest.started_at) : o.fallbackDay
  const d0 = o.startOf(day)
  const d1 = o.startOf(addDays(day, 1))
  const live = o.now >= d0 && o.now < d1
  const { spans, nowAt } = outageSpans(list, d0, d1, o.now)
  const marks = list.flatMap((x) => {
    const mark = outageSpans([x], d0, d1, o.now).spans[0]
    if (!mark) return []
    return [{ ...mark, from: o.clock(Math.max(x.started_at, d0)), to: o.clock(Math.min(x.ended_at ?? o.now, d1)), min: Math.max(1, Math.round(insideSeconds(x, d0, d1, o.now) / 60)) }]
  })
  const calm = !!latest && latest.ended_at !== null && o.now - latest.ended_at > CALM_AFTER
  return { spans, nowAt, from: '00:00', now: live ? o.clock(o.now) : '24:00', live, marks, calm }
}
