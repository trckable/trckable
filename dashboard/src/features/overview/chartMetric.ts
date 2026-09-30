// What the main chart shows, and how each number comes onto it. The choice is
// in the address ("metric=revenue"), like the period and the filters; a page
// that cannot show it (a share link without revenue, a site with no payments
// connected, a chart by the hour for a number only days carry) shows visitors,
// whatever the address says.
import { timeCopy } from '../../charts/copy'
import type { TimeChartProps } from '../../charts/TimeChart'
import type { Day, Money, Point } from '../../lib/api'
import { fmtDuration, fmtMoney, fmtMoneyAxis, fmtPct } from '../../lib/format'
import type { ChartMetricId } from '../../lib/url'
import { copy } from './copy'

export type ChartMetric = 'visitors' | ChartMetricId

/** What a page can draw: revenue and what is made of it only with payments, and what only days carry only by day. */
export interface Can {
  money: boolean
  days: boolean
}

const NEEDS_MONEY: ChartMetric[] = ['revenue', 'conversion', 'per-visitor']
const NEEDS_DAYS: ChartMetric[] = ['conversion', 'per-visitor', 'bounce', 'session']

/** Whether the chart can draw this number here (a tile is pressable exactly then). */
export function canChart(m: ChartMetric, can: Can): boolean {
  if (m === 'pageviews') return !can.money // the tile row has room for Pageviews only where revenue does not
  if (NEEDS_MONEY.includes(m) && !can.money) return false
  return !NEEDS_DAYS.includes(m) || can.days
}

export function chartMetric(asked: ChartMetricId | undefined, can: Can): ChartMetric {
  return asked && canChart(asked, can) ? asked : 'visitors'
}

export const metricName = (m: ChartMetric) =>
  ({ visitors: copy.visitors, pageviews: copy.pageviews, revenue: copy.revenue, conversion: copy.conversion, 'per-visitor': copy.perVisitorTile, bounce: copy.bounce, session: copy.session })[m]

/** The number a day-by-day chart plots for a metric, from that day's own numbers (empty days are missing from the report: zero). */
function ofDay(m: ChartMetric, d: Day | undefined): number {
  if (!d) return 0
  const v = d.kpis.visitors
  if (m === 'conversion') return v ? (d.money?.payments ?? 0) / v : 0
  if (m === 'per-visitor') return v ? (d.money?.revenue ?? 0) / v : 0
  if (m === 'bounce') return d.kpis.bounce_rate
  return d.kpis.avg_session_s
}

/** One number per bucket of the chart, in the units the report carries (minor units for money, fractions for rates). */
export function metricValues(m: ChartMetric, o: { series: Point[]; revenue: number[]; days?: Day[] }): number[] {
  if (m === 'revenue') return o.revenue
  if (m === 'visitors' || m === 'pageviews') return o.series.map((p) => p[m])
  const byDate = new Map((o.days ?? []).map((d) => [d.date, d]))
  return o.series.map((p) => ofDay(m, byDate.get(p.t.slice(0, 10))))
}

/** The comparison period's line: the report carries the previous period's visitors, pageviews and revenue by bucket, and nothing else. */
export function ghostValues(m: ChartMetric, series: Point[] | undefined): number[] | undefined {
  if (!series) return undefined
  if (m === 'visitors' || m === 'pageviews') return series.map((p) => p[m])
  return m === 'revenue' ? series.map((p) => p.revenue ?? 0) : undefined
}

const rate = (x: number) => (x * 100).toFixed(x < 0.1 ? 2 : 1) + '%'
const axisRate = (x: number) => `${+(x * 100).toFixed(1)}%`

/**
 * The chart's props for a metric: how a value and an axis label are written,
 * and money's colour and its plot. With visitors up front, revenue has a plot
 * of its own under the line; pressed, it takes the whole chart. Nothing that
 * needs payments without them (a shared page without revenue never draws it).
 */
export function metricProps(m: ChartMetric, money: Money | undefined, revenue: number[]): Pick<TimeChartProps, 'tone' | 'fmt' | 'axis' | 'fraction' | 'revenue'> {
  const cur = money?.currency ?? ''
  const exp = money?.exponent ?? 2
  const fmt = (n: number) => fmtMoney(n, cur, exp)
  const axis = (n: number) => fmtMoneyAxis(n, cur, exp)
  if (m === 'revenue') return { tone: 'money', fmt, axis }
  if (m === 'per-visitor') return { tone: 'money', fmt: (n) => fmtMoney(n, cur, exp, { cents: true }), axis }
  if (m === 'conversion') return { fmt: rate, axis: axisRate, fraction: true }
  if (m === 'bounce') return { fmt: fmtPct, axis: axisRate, fraction: true }
  if (m === 'session') return { fmt: fmtDuration, axis: fmtDuration }
  if (!money) return {}
  return { revenue: { values: revenue, fmt, axis, label: copy.revenue, none: timeCopy.noSalesPeriod } }
}
