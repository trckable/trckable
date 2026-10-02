// The moments and the findings of a period, for the chart's markers and the
// card on opening. Aggregates only, the same as the report.
import { call, reportURL, type ReportQuery } from '../../lib/api'
import type { Moment } from '../story/moments'

export const momentsApi = {
  /** What happened in the period, bucket by bucket (the server's /moments), by the day or by the hour. */
  moments: (site: string, q: ReportQuery, bucket: 'day' | 'hour', signal?: AbortSignal) =>
    call<{ moments: Moment[]; currency?: string; exponent?: number }>('GET', reportURL(site, { ...q, compare: undefined, daily: false, deep: false, bucket }).replace('/report?', '/moments?'), undefined, signal, true),
}
