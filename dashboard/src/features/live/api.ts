// Live mode's one read: the site's last 30 minutes (server/internal/api/now.go).
import { call, type Visit } from '../../lib/api'

/** Someone on the site now: their latest page or goal, and when they were last
 *  seen doing anything (reading counts). */
export interface NowVisit extends Visit {
  last: number // unix ms
}

export interface LiveNow {
  at: number // unix ms the numbers were taken at
  start: number // unix ms where minutes[0] begins, on a whole minute
  minutes: number[] // pageviews per minute, oldest first; the last is running now
  online: number
  visitors: number // last 30 minutes
  previous: number // the 30 minutes before
  sources: { channel: string; visitors: number }[]
  recent: NowVisit[]
  // Today's revenue, only while the revenue module is on and payments flow.
  revenue?: { amount: number; currency: string; exponent: number }
}

export const liveNow = (site: string, signal?: AbortSignal) => call<LiveNow>('GET', `/sites/${encodeURIComponent(site)}/now`, undefined, signal)
