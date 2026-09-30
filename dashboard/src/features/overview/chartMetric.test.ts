import { describe, expect, it } from 'vitest'
import type { Day, KPIs, Money, Point } from '../../lib/api'
import { canChart, chartMetric, ghostValues, metricName, metricProps, metricValues } from './chartMetric'

const money = { currency: 'USD', exponent: 2 } as Money
const all = { money: true, days: true }

describe('chartMetric', () => {
  it('is what the address says, when this page can draw it', () => {
    expect(chartMetric('revenue', all)).toBe('revenue')
    expect(chartMetric('bounce', all)).toBe('bounce')
    expect(chartMetric(undefined, all)).toBe('visitors')
    expect(chartMetric('pageviews', { money: false, days: true })).toBe('pageviews')
  })
  it('is visitors on a page with no revenue, whatever the address says (a share link without it)', () => {
    for (const m of ['revenue', 'conversion', 'per-visitor'] as const) expect(chartMetric(m, { money: false, days: true })).toBe('visitors')
  })
  it('is visitors where only days carry the number and the chart is by the hour, the week or the month', () => {
    for (const m of ['conversion', 'per-visitor', 'bounce', 'session'] as const) expect(chartMetric(m, { money: true, days: false })).toBe('visitors')
    expect(chartMetric('revenue', { money: true, days: false })).toBe('revenue') // revenue is a number of every bucket
  })
  it('has no Pageviews where the Revenue tile took its place', () => {
    expect(chartMetric('pageviews', all)).toBe('visitors')
  })
  it('makes a tile pressable exactly when it can be drawn', () => {
    expect(canChart('visitors', { money: false, days: false })).toBe(true)
    expect(canChart('bounce', { money: false, days: false })).toBe(false)
    expect(canChart('bounce', { money: false, days: true })).toBe(true)
    expect(canChart('revenue', { money: false, days: true })).toBe(false)
  })
  it('names what it shows', () => {
    expect(metricName('revenue')).toBe('Revenue')
    expect(metricName('per-visitor')).toBe('Per visitor')
    expect(metricName('bounce')).toBe('Bounce rate')
  })
})

const kpis = (visitors: number, bounce: number, secs: number): KPIs => ({ visitors, sessions: visitors, pageviews: visitors * 2, bounce_rate: bounce, avg_session_s: secs, views_per_session: 2, new_visitor_share: 0.5 })
const series: Point[] = [
  { t: '2026-09-01T00:00', visitors: 100, pageviews: 210, revenue: 14_900 },
  { t: '2026-09-02T00:00', visitors: 0, pageviews: 0 },
  { t: '2026-09-03T00:00', visitors: 200, pageviews: 400 },
]
const days: Day[] = [
  { date: '2026-09-01', kpis: kpis(100, 0.4, 90), dims: {}, money: { revenue: 14_900, payments: 2, new: 14_900, renewal: 0 } },
  { date: '2026-09-03', kpis: kpis(200, 0.5, 120), dims: {} },
]
const revenue = series.map((p) => p.revenue ?? 0)

describe('metricValues', () => {
  it('reads each bucket of the chart: the report carries visitors, pageviews and revenue by bucket', () => {
    expect(metricValues('visitors', { series, revenue })).toEqual([100, 0, 200])
    expect(metricValues('pageviews', { series, revenue })).toEqual([210, 0, 400])
    expect(metricValues('revenue', { series, revenue })).toEqual([14_900, 0, 0])
  })
  it('works the rest out from each day, an empty day being missing from the report', () => {
    const o = { series, revenue, days }
    expect(metricValues('conversion', o)).toEqual([0.02, 0, 0])
    expect(metricValues('per-visitor', o)).toEqual([149, 0, 0])
    expect(metricValues('bounce', o)).toEqual([0.4, 0, 0.5])
    expect(metricValues('session', o)).toEqual([90, 0, 120])
  })
  it('is zero everywhere without days', () => {
    expect(metricValues('bounce', { series, revenue })).toEqual([0, 0, 0])
  })
})

describe('ghostValues', () => {
  it('draws last period for the numbers the report carries it for, and only those', () => {
    expect(ghostValues('visitors', series)).toEqual([100, 0, 200])
    expect(ghostValues('revenue', series)).toEqual([14_900, 0, 0])
    expect(ghostValues('bounce', series)).toBeUndefined()
    expect(ghostValues('revenue', undefined)).toBeUndefined()
  })
})

describe('metricProps', () => {
  it('puts revenue in a plot of its own under the visitors, with its own axis labels', () => {
    const p = metricProps('visitors', money, [0, 14_900, 0])
    expect(p.tone).toBeUndefined()
    expect(p.revenue?.values).toEqual([0, 14_900, 0])
    expect(p.revenue?.axis(10_000)).toBe('$100')
    expect(p.revenue?.fmt(14_900)).toBe('$149')
  })
  it('turns the whole chart to money when the Revenue tile is pressed, and has no plot under it', () => {
    const p = metricProps('revenue', money, [0, 14_900, 0])
    expect(p.tone).toBe('money')
    expect(p.revenue).toBeUndefined()
    expect(p.fmt?.(14_900)).toBe('$149')
  })
  it('writes each number in its own units, on the axis too', () => {
    expect(metricProps('per-visitor', money, []).fmt?.(127)).toBe('$1.27')
    expect(metricProps('conversion', money, []).fmt?.(0.0266)).toBe('2.66%')
    expect(metricProps('conversion', money, []).axis?.(0.02)).toBe('2%')
    expect(metricProps('bounce', money, []).axis?.(0.25)).toBe('25%')
    expect(metricProps('session', money, []).fmt?.(111)).toBe('1m 51s')
  })
  it('draws no revenue at all without payments (a share link without revenue, revenue module off)', () => {
    expect(metricProps('visitors', undefined, [0, 5])).toEqual({})
  })
})
