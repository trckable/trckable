// The Data view's extras ask the server for three things beyond the report:
// highlights, the pages that sell and the latest buyers. Kept out of lib/api
// so the first load does not carry them.
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
  /** new_referrer and conversion_drop: the day it starts, where it sits on the chart. */
  since?: string
}

/** One sale and the way to it. Never a name, an email or an id. */
export interface Buyer {
  id: string
  at: string
  amount: number
  kind: string
  channel?: string
  referrer?: string
  pages?: string[]
  visits?: number
  seconds?: number
  /** The billing country the payment provider named (ISO 3166 alpha-2), when it did. */
  country?: string
}

/** One payment paid back. Never a name, an email or an id. */
export interface Refund {
  id: string
  at: string
  amount: number
  kind: string
  country?: string
}

export interface Refunds {
  refunds: Refund[]
  /** How many, and how much in all, in the period. */
  count: number
  amount: number
  /** How many in the 90 days before the period ends. */
  count_90d: number
}

/** The report's own selectors, and the two that change what is credited: test payments and the first-touch model. */
const qs = (q: ReportQuery) => rangeQS(q) + (q.testPayments ? '&payments=test' : '') + (q.attr ? '&attr=first' : '')

export const extrasApi = {
  // Highlights are about the whole site: no filters.
  insights: (site: string, q: ReportQuery) => call<{ insights: Insight[] }>('GET', `/sites/${site}/insights` + qs({ ...q, filters: undefined })),
  pagesSell: (site: string, q: ReportQuery) => call<{ pages: Row[] }>('GET', `/sites/${site}/report/pages-sell` + qs(q)),
  buyers: (site: string, q: ReportQuery, n = 8) => call<{ buyers: Buyer[] }>('GET', `/sites/${site}/buyers` + qs(q) + `&n=${n}`),
  refunds: (site: string, q: ReportQuery, n = 4) => call<Refunds>('GET', `/sites/${site}/refunds` + qs({ ...q, filters: undefined }) + `&n=${n}`),
}
