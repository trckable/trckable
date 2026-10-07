// Live mode's one read: the site's last 30 minutes (server/internal/api/now.go).
import { call, type Visit } from '../../lib/api'

/** Someone on the site now: their latest page or goal, and when they were last
 *  seen doing anything (reading counts). */
export interface NowVisit extends Omit<Visit, 'kind'> {
  /** "active": no page or goal in the last day, only other events. */
  kind: Visit['kind'] | 'active'
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
  more?: number // online people the list left out (it holds at most 50)
  // Today's revenue, only while the revenue module is on and payments flow.
  revenue?: { amount: number; currency: string; exponent: number }
  // The site's day so far against the same time a week ago; absent when the server cannot tell.
  today?: NowToday
}

export interface NowToday {
  visitors: number
  before: number // last week's visitors by this time of day
  compare: boolean // false when last week's day had no visit: no percentage
  hours: number[] // running visitors by hour, midnight to the hour now
  last: number[] // the same for last week's whole day (24)
}

export const liveNow = (site: string, signal?: AbortSignal) => call<LiveNow>('GET', `/sites/${encodeURIComponent(site)}/now`, undefined, signal)

/** Who brings more people than usual: a source (by name), an entry page, a country code or a campaign. */
export interface BusierWhy {
  dim: 'source' | 'page' | 'country' | 'campaign'
  value: string
  now: number
  usual: number
  plus: number
}

/** How the people online compare with the same hour on past days (server/internal/busier). */
export interface Busier {
  now: number
  baseline: boolean // false under a week of history: no usual, no verdict
  usual: number
  low: number
  high: number
  state: 'busier' | 'quieter' | ''
  since?: number // unix seconds the rise began; present while busier
  since_capped?: boolean // ... at or before that, the look back ending there
  rest: number // extra people the named sources do not explain
  why: BusierWhy[]
}

export const liveBusier = (site: string, signal?: AbortSignal) => call<Busier>('GET', `/sites/${encodeURIComponent(site)}/busier`, undefined, signal)
