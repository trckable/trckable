// The moments and the findings of a period, for the chart's markers and the
// card on opening. Aggregates only, the same as the report.
import { call, rangeQS, reportURL, type ReportQuery } from '../../lib/api'
import { addDays, todayIn } from '../../lib/dates'
import type { Moment } from '../story/moments'

export const momentsApi = {
  /** What happened in the period, bucket by bucket (the server's /moments), by the day or by the hour. */
  moments: (site: string, q: ReportQuery, bucket: 'day' | 'hour', signal?: AbortSignal) =>
    call<{ moments: Moment[]; currency?: string; exponent?: number }>('GET', reportURL(site, { ...q, compare: undefined, daily: false, deep: false, bucket }).replace('/report?', '/moments?'), undefined, signal, true),
}

/** Days a source's own chart shows (its sparkline's request: server/internal/query/sparks.go). */
const OWN_DAYS = 30

/** One source's visitors for each of the last days: for the small chart of a finding about it. */
export async function ownDays(site: string, tz: string, dim: string, value: string): Promise<{ values: number[]; days: string[] }> {
  const to = todayIn(tz)
  const qs = rangeQS({ from: addDays(to, 1 - OWN_DAYS), to }) + '&dim=' + encodeURIComponent(dim) + '&v=' + encodeURIComponent(value)
  const r = await call<{ days: string[]; rows: Record<string, number[]> }>('GET', `/sites/${encodeURIComponent(site)}/sparks` + qs, undefined, undefined, true)
  return { values: r.rows[value] ?? [], days: r.days }
}
