// The timeline of the incident card: the stretches the site did not answer, as shares of the period (0 at its first
// midnight, 1 at its last), so a day-long look and a month-long look draw the red where it really was. Pure: outage.test.ts.
import { diffDays } from '../../lib/dates'

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
