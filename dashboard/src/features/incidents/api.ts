// The incident record's calls (server/internal/api/incidents.go).
import { call } from '../../lib/api'

export interface Incident {
  id: string
  site: string
  kind: 'down' | 'quiet'
  started_at: number
  /** Unix seconds; null while it goes on. */
  ended_at: number | null
  /** The check's error, or "no visits". */
  cause: string
  /** The visits a normal stretch of that length brings; null when there was too little history to say. */
  expected_visits: number | null
  note: string
}

/** A period's totals; the downtime is cut to the period. */
export interface Summary {
  count: number
  seconds: number
  lost: number
  lost_some: boolean
}

export const incidents = {
  /** Every incident that overlaps [from, to] (unix seconds), with the totals. */
  period: (site: string, from: number, to: number) => call<{ incidents: Incident[]; summary: Summary }>('GET', `/sites/${site}/incidents?from=${from}&to=${to}`),
  /** A page of 50, newest first; `before` is the start of the last one of the page before. */
  page: (site: string, before?: number) => call<{ incidents: Incident[]; next_before: number | null }>('GET', `/sites/${site}/incidents?limit=50${before ? `&before=${before}` : ''}`),
  /** Every site's incidents in the last `days` days. */
  account: (days: number) => call<{ incidents: Incident[] }>('GET', `/incidents?days=${days}`),
  note: (site: string, id: string, note: string) => call<Incident>('PATCH', `/sites/${site}/incidents/${id}`, { note }),
}
