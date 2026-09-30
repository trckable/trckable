// What the main chart's hover card says about a day beyond its headline
// figure: the small numbers (and, for cookieless sites, the new/returning
// split), and how the day's sales add up.
import type { TimeChartProps } from '../../charts/TimeChart'
import type { Day, Money, Point, Site } from '../../lib/api'
import { fmtDuration, fmtInt, fmtMoney, fmtPct } from '../../lib/format'
import { newVsReturning } from '../cookieless/labels'
import type { ChartMetric } from './chartMetric'
import { copy } from './copy'
import { hourDetail } from './hourDetail'

type Row = { label: string; value: string; faint?: boolean; short?: string }

const conversion = (x: number) => (x * 100).toFixed(x < 0.1 ? 2 : 1) + '%'

/** "3 sales · $149 new · $49 renewal": the parts that are nothing are left out. Null when there were no sales. */
export function saleNote(d: Day | undefined, fmt: (minor: number) => string): string | null {
  const m = d?.money
  if (!m || m.payments <= 0) return null
  const parts = [copy.sales(m.payments)]
  if (m.new > 0) parts.push(copy.newAmount(fmt(m.new)))
  if (m.renewal > 0) parts.push(copy.renewalAmount(fmt(m.renewal)))
  return parts.join(' · ')
}

/** The row a metric already says as the card's headline. */
const OWN: Partial<Record<ChartMetric, string>> = { pageviews: 'Pageviews', conversion: copy.conversion, 'per-visitor': copy.perVisitor, bounce: copy.bounce, session: copy.session }

/** A day's lines. Where the visits lead they come first and the money follows; where another number is the chart, the visitors are a line and what the headline says is not repeated. */
export function dayDetail(d: Day, o: { site: Pick<Site, 'cookieless'>; money?: Money; metric: ChartMetric }): { rows: Row[]; splits: ReturnType<typeof newVsReturning>['splits'] } {
  const nvr = newVsReturning(d.kpis, o.site)
  const paid: Row[] = []
  if (o.money && d.money) {
    const perVisitor = d.kpis.visitors ? d.money.revenue / d.kpis.visitors : 0
    paid.push({ label: copy.perVisitor, short: copy.perVisitorShort, value: fmtMoney(perVisitor, o.money.currency, o.money.exponent, { cents: true }) })
    paid.push({ label: copy.conversion, short: copy.conversionShort, value: d.kpis.visitors ? conversion(d.money.payments / d.kpis.visitors) : '–' })
  }
  const views: Row = { label: 'Pageviews', short: 'views', value: fmtInt(d.kpis.pageviews) }
  const rest: Row[] = [
    { label: copy.bounce, short: 'bounce', value: fmtPct(d.kpis.bounce_rate), faint: true },
    { label: copy.session, short: 'session', value: fmtDuration(d.kpis.avg_session_s), faint: true },
  ]
  const visitors: Row = { label: copy.visitors, short: 'visitors', value: fmtInt(d.kpis.visitors) }
  const rows = o.metric === 'visitors' ? [views, ...nvr.rows, ...paid, ...rest] : [visitors, ...paid, views, ...nvr.rows, ...rest]
  return { rows: rows.filter((r) => r.label !== OWN[o.metric]), splits: nvr.splits }
}

interface TipArgs {
  /** The buckets on the chart. */
  series: Point[]
  /** By the hour: an hour has no day's breakdown behind it. */
  hours: boolean
  /** The chart is by day (by week or month, a bucket is not a day). */
  byDay: boolean
  days?: Day[]
  site: Pick<Site, 'cookieless'>
  money?: Money
  metric: ChartMetric
}

/** The chart's `detail` and `saleNote`: what each hovered bucket adds to its card. */
export function chartTips(a: TipArgs): Pick<TimeChartProps, 'detail' | 'saleNote'> {
  // Days skip the empty ones: match by date, not by position.
  const dayAt = (i: number) => (a.byDay && !a.hours ? a.days?.find((x) => x.date === a.series[i]?.t.slice(0, 10)) : undefined)
  const fmt = (minor: number) => (a.money ? fmtMoney(minor, a.money.currency, a.money.exponent) : '')
  return {
    detail: (i) => {
      if (a.hours) return hourDetail(a.series[i], a.site)
      const d = dayAt(i)
      return d ? dayDetail(d, a) : null
    },
    saleNote: (i) => saleNote(dayAt(i), fmt),
  }
}
