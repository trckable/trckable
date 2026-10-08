import { describe, expect, it } from 'vitest'
import type { Day, KPIs, Money, Point } from '../../lib/api'
import { chartTips, dayDetail, saleNote } from './dayTips'

const kpis: KPIs = { visitors: 200, sessions: 220, pageviews: 500, bounce_rate: 0.4, avg_session_s: 95, views_per_session: 2, new_visitor_share: 0.6 }
const money = { currency: 'USD', exponent: 2 } as Money
const day = (m?: Day['money']): Day => ({ date: '2026-09-02', kpis, dims: {}, money: m })
const fmt = (n: number) => `$${n / 100}`
const site = { cookieless: false }

describe('saleNote', () => {
  it('counts the sales and splits new from renewal', () => {
    expect(saleNote(day({ revenue: 19_800, payments: 3, new: 14_900, renewal: 4_900 }), fmt)).toBe('3 sales · $149 new · $49 renewal')
    expect(saleNote(day({ revenue: 14_900, payments: 1, new: 14_900, renewal: 0 }), fmt)).toBe('1 sale · $149 new')
  })
  it('leaves out a part that is nothing', () => {
    expect(saleNote(day({ revenue: 4_900, payments: 1, new: 0, renewal: 4_900 }), fmt)).toBe('1 sale · $49 renewal')
    expect(saleNote(day({ revenue: 100, payments: 2, new: 0, renewal: 0 }), fmt)).toBe('2 sales')
  })
  it('is nothing on a day without sales', () => {
    expect(saleNote(day(), fmt)).toBeNull()
    expect(saleNote(undefined, fmt)).toBeNull()
    expect(saleNote(day({ revenue: 0, payments: 0, new: 0, renewal: 0 }), fmt)).toBeNull()
  })
})

const labels = (d: ReturnType<typeof dayDetail>) => d.rows.map((r) => r.label)

describe('dayDetail', () => {
  const sold = day({ revenue: 19_800, payments: 4, new: 14_900, renewal: 4_900 })
  it('follows the visits with the money, by default', () => {
    const d = dayDetail(sold, { site, money, metric: 'visitors' })
    expect(labels(d)).toEqual(['Pageviews', 'Revenue / visitor', 'Paid conversion', 'Bounce rate', 'Session time'])
    expect(d.rows.find((r) => r.label === 'Revenue / visitor')?.value).toBe('$0.99')
    expect(d.rows.find((r) => r.label === 'Paid conversion')?.value).toBe('2.00%')
    expect(d.splits.map((s) => s.aLabel)).toEqual(['new'])
  })
  it('leads with the money, and gives the visitors a line, when revenue is the chart', () => {
    expect(labels(dayDetail(sold, { site, money, metric: 'revenue' })).slice(0, 4)).toEqual(['Visitors', 'Revenue / visitor', 'Paid conversion', 'Pageviews'])
  })
  it('leaves out the row its own headline already says', () => {
    expect(labels(dayDetail(sold, { site, money, metric: 'bounce' }))).not.toContain('Bounce rate')
    expect(labels(dayDetail(sold, { site, money, metric: 'conversion' }))).not.toContain('Paid conversion')
    expect(labels(dayDetail(sold, { site, money, metric: 'per-visitor' }))).not.toContain('Revenue / visitor')
    expect(labels(dayDetail(sold, { site, money, metric: 'session' }))[0]).toBe('Visitors')
  })
  it('has no money lines on a day without sales', () => {
    expect(labels(dayDetail(day(), { site, money, metric: 'visitors' }))).toEqual(['Pageviews', 'Bounce rate', 'Session time'])
  })
})

describe('chartTips', () => {
  const series: Point[] = [{ t: '2026-09-01T00:00', visitors: 1, pageviews: 1 }, { t: '2026-09-02T00:00', visitors: 1, pageviews: 1 }]
  const days = [day({ revenue: 4_900, payments: 1, new: 4_900, renewal: 0 })]
  const tips = (o: Partial<Parameters<typeof chartTips>[0]> = {}) => chartTips({ series, hours: false, byDay: true, days, site, money, metric: 'visitors', ...o })
  it('finds a day by its date, the empty ones being left out of the report', () => {
    expect(tips().saleNote?.(1)).toBe('1 sale · $49.00 new')
    expect(tips().saleNote?.(0)).toBeNull()
    expect(tips().detail?.(0)).toBeNull()
  })
  it('says nothing about sales by week, month or hour: a bucket is not a day', () => {
    expect(tips({ byDay: false }).saleNote?.(1)).toBeNull()
    expect(tips({ hours: true }).saleNote?.(1)).toBeNull()
    expect(tips({ hours: true }).detail?.(1)?.rows?.[0].label).toBe('Pageviews')
  })
})
