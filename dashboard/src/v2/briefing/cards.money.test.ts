import { describe, expect, it } from 'vitest'
import type { Money, SearchReport } from '../../lib/api'
import { salesCards, searchCard, stuckCard } from './cards.money'

const money = (o: Partial<Money> = {}): Money => ({ currency: 'USD', exponent: 2, revenue: 30500, refunds: 0, payments: 2, customers: 1, paying_visitors: 2, conversion: 0, revenue_per_visitor: 0, new_revenue: 8700, renewal_revenue: 0, unattributed: 0, unconverted: 0, ...o })
const usd = (m: number) => `$${Math.round(m / 100)}`
const base = { fmt: usd, clock: (iso: string) => iso.slice(11, 16), today: true, rule: 'Compared with the last Fridays.' }

describe('the sales cards', () => {
  it('says who paid, what came in, and what the usual is', () => {
    const [c] = salesCards({ ...base, money: money(), band: { c: 11000, lo: 8000, hi: 14000 }, buyers: [{ id: 'a', at: '2026-10-16T15:20:00Z', amount: 8700, kind: 'new', referrer: 'google.com' }, { id: 'b', at: '2026-10-16T16:00:00Z', amount: 21800, kind: 'upgrade' }] })
    expect(c.head).toBe('1 person became a customer, 1 customer upgraded')
    expect(c.rest).toBe(': $305 in')
    expect(c.score).toBe(72)
    expect(c.why).toContain('Usual $80–$140 by now.')
    expect(c.vis).toMatchObject({ k: 'rcpt' })
  })
  it('says a refund first, and a quiet day when nothing sold under the usual', () => {
    expect(salesCards({ ...base, money: money({ refunds: 4000, payments: 0, revenue: -4000 }), band: null, buyers: [] })[0].bad).toBe(true)
    const [none] = salesCards({ ...base, money: money({ payments: 0, revenue: 0 }), band: { c: 9000, lo: 6000, hi: 12000 }, buyers: [] })
    expect(none.head).toBe('No sales yet')
  })
})

const sr = (rows: { key: string; clicks: number }[]): SearchReport => ({ property: 'p', dim: 'query', rows: rows.map((r) => ({ ...r, impressions: r.clicks * 20, ctr: 0.05, position: 4 })), from: '', to: '', clicks: rows.reduce((n, r) => n + r.clicks, 0), impressions: 0, preliminary_from: '', ignored_filters: null })

describe('the search card', () => {
  it('names a query that is new', () => {
    const c = searchCard({ story: { cur: sr([{ key: 'old', clicks: 30 }, { key: 'fresh one', clicks: 8 }]), prev: sr([{ key: 'old', clicks: 30 }]) }, domain: 'x.com', rule: '' })
    expect(c?.head).toBe('You now rank for “fresh one”')
  })
  it('names the query that rose furthest from what it sent before', () => {
    const c = searchCard({ story: { cur: sr([{ key: 'a', clicks: 60 }, { key: 'b', clicks: 30 }]), prev: sr([{ key: 'a', clicks: 20 }, { key: 'b', clicks: 30 }]) }, domain: 'x.com', rule: '' })
    expect(c?.head).toBe('“a” sent 60 clicks')
    expect(c?.rest).toContain('3.0× your usual')
  })
  it('says nothing when nothing changed', () => {
    expect(searchCard({ story: { cur: sr([{ key: 'a', clicks: 30 }]), prev: sr([{ key: 'a', clicks: 30 }]) }, domain: 'x.com', rule: '' })).toBeNull()
  })
})

describe('the stuck card', () => {
  it('lists what was pressed again and again', () => {
    const c = stuckCard({ page: '/pricing', views: 400, rage: [{ el: 'button.plan', n: 4 }] }, '')
    expect(c.head).toBe('Someone got stuck on /pricing')
    expect(c.vis).toMatchObject({ rows: [{ l: 'Landed on /pricing' }, { l: 'Clicked button.plan 4 times' }] })
  })
})
