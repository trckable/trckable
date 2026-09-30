// The Data view's extras ask the server for four things beyond the report:
// highlights, the rings on the chart, the pages that sell and the latest
// buyers. Kept out of lib/api so the first load does not carry them.
import { call, rangeQS, type ReportQuery, type Row } from '../../lib/api'

/** One line of the Highlights tab: a rule the server ran, with the report's own figures (server/internal/insights). */
export interface Insight {
  kind: 'source_move' | 'top_revenue' | 'conversion_drop' | 'new_referrer'
  dim: string
  value: string
  now: number
  was?: number
  change?: number
  revenue?: number
  per_visitor?: number
  times?: number
  rate?: number
  was_rate?: number
}

/** A ring on the main chart: a spike of visitors or a burst of sales, at the bucket it happened in. */
export interface ChartMarker {
  t: string
  kind: 'spike' | 'sale'
  factor: number
  referrer?: string
  count?: number
  amount?: number
  channel?: string
}

/** One sale and the way to it. Never a name, an email or an id. */
export interface Buyer {
  at: string
  amount: number
  kind: string
  channel?: string
  referrer?: string
  pages?: string[]
  visits?: number
  seconds?: number
}

export const extrasApi = {
  insights: (site: string, q: ReportQuery) => call<{ insights: Insight[] }>('GET', `/sites/${site}/insights?from=${q.from}&to=${q.to}`),
  markers: (site: string, q: ReportQuery, bucket: 'day' | 'hour', signal?: AbortSignal) =>
    call<{ markers: ChartMarker[]; currency?: string; exponent?: number }>('GET', `/sites/${site}/markers` + rangeQS(q) + '&bucket=' + bucket, undefined, signal),
  pagesSell: (site: string, q: ReportQuery) => call<{ pages: Row[] }>('GET', `/sites/${site}/report/pages-sell` + rangeQS(q) + (q.attr ? '&attr=first' : '')),
  buyers: (site: string, q: ReportQuery) => call<{ buyers: Buyer[] }>('GET', `/sites/${site}/buyers` + rangeQS(q) + '&n=8'),
}
