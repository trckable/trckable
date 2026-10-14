// The links read (server/internal/api/links.go): the tagged links of a period and what each brought.
import { call, rangeQS } from '../../lib/api'

export interface Link {
  /** The filter that finds this link's visits: a referrer (a ?ref tag and its site) or a utm_source. */
  dim: 'referrer' | 'source'
  value: string
  visitors: number
  /** Visitors who reached a goal. */
  goals: number
  /** Revenue credited to it, in minor units; absent while revenue is off or the row is a utm_source. */
  revenue?: number
  /** Unix seconds of the latest visit in the period. */
  last: number
  /** Visitors per day over the 30 days up to the period's end. */
  spark: number[]
}

export interface LinksAnswer {
  links: Link[]
  /** The goals module is on: a count of 0 means none, not unknown. */
  goals: boolean
  currency?: string
  exponent?: number
}

export const linksApi = {
  read: (site: string, from: string, to: string) => call<LinksAnswer>('GET', `/sites/${encodeURIComponent(site)}/report/links` + rangeQS({ from, to })),
}
