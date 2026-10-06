// The moments and the findings of a period, for the chart's markers and the
// card on opening. Aggregates only, the same as the report.
import { call, rangeQS, reportURL, type ReportQuery } from '../../lib/api'
import { addDays, todayIn } from '../../lib/dates'

export type MomentKind = 'spike' | 'surge' | 'sale' | 'country' | 'ai' | 'milestone' | 'note'

export interface Moment {
  t: string
  kind: MomentKind
  factor?: number
  referrer?: string
  visitors?: number
  count?: number
  amount?: number
  channel?: string
  country?: string
  bot?: string
  step?: string
  family?: string
  value?: number
  currency?: string
  text?: string
}

export const momentsApi = {
  /** What happened in the period, bucket by bucket (the server's /moments), by the day or by the hour. Never narrowed by a filter: a moment is the site's own (its figure is the day's or the hour's whole traffic), so the marker, its line and its card say the same number whatever the page is filtered to. */
  moments: (site: string, q: ReportQuery, bucket: 'day' | 'hour', signal?: AbortSignal) =>
    call<{ moments: Moment[]; currency?: string; exponent?: number }>('GET', reportURL(site, { ...q, filters: undefined, compare: undefined, daily: false, deep: false, bucket }).replace('/report?', '/moments?'), undefined, signal, true),
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
