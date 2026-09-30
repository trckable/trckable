// An hour's lines in the main chart's hover card: what an hourly series has.
import type { KPIs, Site } from '../../lib/api'
import { fmtInt } from '../../lib/format'
import { newVsReturning } from '../cookieless/labels'

const none: KPIs = { visitors: 0, sessions: 0, pageviews: 0, bounce_rate: 0, avg_session_s: 0, views_per_session: 0, new_visitor_share: 0 }

export function hourDetail(pt: { pageviews: number } | undefined, site: Pick<Site, 'cookieless'>) {
  if (!pt) return null
  const rows: { label: string; value: string; faint?: boolean; short?: string }[] = [{ label: 'Pageviews', short: 'views', value: fmtInt(pt.pageviews) }]
  // Cookieless says what it cannot count, by the hour as by the day.
  if (site.cookieless) rows.push(...newVsReturning(none, site).rows)
  return { rows }
}
