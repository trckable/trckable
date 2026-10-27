import { describe, expect, it } from 'vitest'
import type { Money, SearchReport } from '../../lib/api'
import { firstCard, leakCard, salesCards, searchCard, stuckCard, withStuck } from './cards.money'

const money = (o: Partial<Money> = {}): Money => ({ currency: 'USD', exponent: 2, revenue: 30500, refunds: 0, payments: 2, customers: 1, paying_visitors: 2, conversion: 0, revenue_per_visitor: 0, new_revenue: 8700, renewal_revenue: 0, new_gross: 0, upgrade_gross: 0, renewal_gross: 0, unattributed: 0, unconverted: 0, ...o })
const usd = (m: number) => `$${Math.round(m / 100)}`
const base = { fmt: usd, clock: (iso: string) => iso.slice(11, 16), today: true, rule: 'Compared with the last Fridays.' }

describe('the sales cards', () => {
  it('says who paid, what came in, and what the usual is', () => {
    const [c] = salesCards({ ...base, money: money(), band: { c: 11000, lo: 8000, hi: 14000 }, buyers: [{ id: 'a', at: '2026-10-16T15:20:00Z', amount: 8700, kind: 'new', referrer: 'google.com' }, { id: 'b', at: '2026-10-16T16:00:00Z', amount: 21800, kind: 'upgrade' }] })
    expect(c.head).toBe('1 new customer, 1 customer upgraded')
    expect(c.rest).toBeUndefined()
    expect(c.score).toBe(72)
    expect(c.why).toContain('Usual $80–$140 by now.')
    expect(c.vis).toMatchObject({ k: 'rcpt' })
  })
  it('puts the buyer\'s country on the receipt line, and nothing when the provider named none', () => {
    const [c] = salesCards({ ...base, money: money(), band: null, buyers: [{ id: 'a', at: '2026-10-16T15:20:00Z', amount: 8700, kind: 'new', country: 'DE' }, { id: 'b', at: '2026-10-16T16:00:00Z', amount: 500, kind: 'new' }] })
    const rows = c.vis?.k === 'rcpt' ? c.vis.rows : []
    expect(rows.map((r) => r.flag)).toEqual(['\u{1F1E9}\u{1F1EA}', '', ''])
  })
  it('lists the refunds as a receipt and counts them over 90 days', () => {
    const refunds = { count: 2, amount: 3000, count_90d: 5, refunds: [{ id: 'x', at: '2026-10-16T15:20:00Z', amount: 2000, kind: 'subscription', country: 'FR' }, { id: 'y', at: '2026-10-16T12:00:00Z', amount: 1000, kind: 'renewal' }] }
    const [c] = salesCards({ ...base, money: money({ refunds: 3000, payments: 0, revenue: -3000 }), band: null, buyers: [], refunds })
    expect(c.bad).toBe(true)
    expect(c.why).toBe('That makes 5 refunds in the last 90 days. A short note to each often shows why.')
    expect(c.vis).toEqual({
      k: 'rcpt',
      rows: [
        { l: 'Refund · New customer', t: '15:20', a: '-$20', flag: '\u{1F1EB}\u{1F1F7}', neg: true },
        { l: 'Refund · Renewal', t: '12:00', a: '-$10', flag: '', neg: true },
        { l: 'Refunded', t: '', a: '-$30', flag: '', neg: true, tot: true },
      ],
    })
  })
  it('keeps the plain refund line when the refunds could not be read', () => {
    const [c] = salesCards({ ...base, money: money({ refunds: 3000, payments: 0, revenue: -3000 }), band: null, buyers: [], refunds: null })
    expect(c.vis).toBeNull()
    expect(c.why).toBe('A short note to each often shows why.')
  })
  it('says a refund first, and a quiet day when nothing sold under the usual', () => {
    expect(salesCards({ ...base, money: money({ refunds: 4000, payments: 0, revenue: -4000 }), band: null, buyers: [] })[0].bad).toBe(true)
    const [none] = salesCards({ ...base, money: money({ payments: 0, revenue: 0 }), band: { c: 9000, lo: 6000, hi: 12000 }, buyers: [] })
    expect(none.head).toBe('No sales yet')
  })
})

const sr = (rows: { key: string; clicks: number }[]): SearchReport => ({ property: 'p', dim: 'query', rows: rows.map((r) => ({ ...r, impressions: r.clicks * 20, ctr: 0.05, position: 4 })), from: '', to: '', clicks: rows.reduce((n, r) => n + r.clicks, 0), impressions: 0, preliminary_from: '', ignored_filters: null })

describe('the sales title counts a new customer whatever the provider calls the first payment', () => {
  const sale = (kind: string) => salesCards({ ...base, money: money({ revenue: 33800, payments: 2, customers: 1, new_revenue: 12000, renewal_revenue: 21800 }), band: null, buyers: [{ id: 'a', at: '2026-10-16T15:20:00Z', amount: 12000, kind }] })[0]
  it.each(['subscription', 'one_time', 'new'])('says the %s payment is a customer, not only the renewal', (kind) => {
    expect(sale(kind).head).toBe('1 new customer, 1 renewal')
  })
  it('does not count an upgrade as a new customer', () => {
    expect(sale('upgrade').head).toBe('1 customer upgraded, 1 renewal')
  })
})

describe('every figure of the sales card is one total', () => {
  it('has the big total equal to the sum of its rows', () => {
    const [c] = salesCards({ ...base, money: money({ revenue: 33800, payments: 2, customers: 1, new_revenue: 12000, renewal_revenue: 21800 }), band: null, buyers: [{ id: 'a', at: '2026-10-16T15:20:00Z', amount: 12000, kind: 'subscription' }] })
    const rows = c.vis?.k === 'rcpt' ? c.vis.rows.filter((r) => !r.tot) : []
    const sum = rows.reduce((n, r) => n + Number((r.a ?? '').replace(/[^0-9.-]/g, '')), 0)
    expect(c.val).toBe('$338')
    expect(sum).toBe(338)
    expect(`${c.head}${c.rest ?? ''}`).not.toMatch(/\$/)
  })
})

describe('the sales rows add up to the headline', () => {
  const rowsOf = (c: ReturnType<typeof salesCards>[number]) => (c.vis?.k === 'rcpt' ? c.vis.rows : [])
  const num = (a?: string) => Number((a ?? '').replace(/[^0-9.-]/g, ''))
  it('lists the renewals the buyers list leaves out, so 2 sales are 2 lines', () => {
    // One new customer ($120) and one renewal ($218): 1 customer, 2 payments, $338.
    const [c] = salesCards({ ...base, money: money({ revenue: 33800, payments: 2, customers: 1, new_revenue: 12000, renewal_revenue: 21800 }), band: null, buyers: [{ id: 'a', at: '2026-10-16T15:20:00Z', amount: 12000, kind: 'new' }] })
    expect(c.head).toBe('1 new customer, 1 renewal')
    expect(c.rest).toBeUndefined()
    const rows = rowsOf(c)
    expect(rows.map((r) => r.l)).toEqual(['New customer', '1 renewal', 'Total in'])
    const lines = rows.filter((r) => !r.tot)
    expect(lines.reduce((n, r) => n + num(r.a), 0)).toBe(num(rows.find((r) => r.tot)?.a))
  })
  it('totals what was kept: a refunded sale is listed net, and the total is the net too', () => {
    const [c] = salesCards({ ...base, money: money({ revenue: 7000, refunds: 5000, payments: 2, customers: 2 }), band: null, buyers: [{ id: 'a', at: '2026-10-16T15:20:00Z', amount: 2000, kind: 'new' }, { id: 'b', at: '2026-10-16T16:20:00Z', amount: 5000, kind: 'new' }] })
    const rows = rowsOf(c)
    expect(rows.filter((r) => !r.tot).reduce((n, r) => n + num(r.a), 0)).toBe(num(rows.find((r) => r.tot)?.a))
    expect(rows.find((r) => r.tot)?.l).toBe('Net')
  })
  it('is one card for what was sold and what went back, with the gross, the refunds and the net', () => {
    const list = salesCards({ ...base, money: money({ revenue: 7000, refunds: 5000, payments: 2, customers: 2 }), band: null, buyers: [{ id: 'a', at: '2026-10-16T15:20:00Z', amount: 2000, kind: 'new' }, { id: 'b', at: '2026-10-16T16:20:00Z', amount: 5000, kind: 'new' }] })
    expect(list).toHaveLength(1)
    expect(list[0].head).toBe('Sold $120')
    expect(list[0].rest).toBe(', $50 refunded, $70 net')
    expect(list[0].bad).toBe(true)
  })
})

describe('the search card', () => {
  it('names a query that is new', () => {
    const c = searchCard({ story: { cur: sr([{ key: 'old', clicks: 30 }, { key: 'fresh one', clicks: 8 }]), prev: sr([{ key: 'old', clicks: 30 }]) }, domain: 'x.com', rule: '' })
    expect(c?.head).toBe('You now rank for “fresh one”')
  })
  it('names the query that rose furthest from what it sent before', () => {
    const c = searchCard({ story: { cur: sr([{ key: 'a', clicks: 60 }, { key: 'b', clicks: 30 }]), prev: sr([{ key: 'a', clicks: 20 }, { key: 'b', clicks: 30 }]) }, domain: 'x.com', rule: '' })
    expect(c?.head).toBe('“a” sent 60 clicks')
    expect(c?.rest).toContain('3.0× the period before')
  })
  it('leads its list with the query it is about, and the footer is about that same query', () => {
    // The new query has fewer clicks than the four before it: it still comes first, and the footer gives its clicks.
    const cur = sr([{ key: 'a', clicks: 90 }, { key: 'b', clicks: 80 }, { key: 'c', clicks: 70 }, { key: 'd', clicks: 60 }, { key: 'fresh one', clicks: 3 }])
    const c = searchCard({ story: { cur, prev: sr(['a', 'b', 'c', 'd'].map((key) => ({ key, clicks: 90 }))) }, domain: 'x.com', rule: '' })
    const rows = c?.vis?.k === 'rcpt' ? c.vis.rows : []
    expect(c?.head).toBe('You now rank for “fresh one”')
    expect(rows[0].l).toBe('“fresh one”')
    expect(rows[0].a).toBe('3')
    expect(c?.why).toContain('3 clicks so far, at position 4.0')
    expect(rows.map((r) => r.l)).toEqual(['“fresh one”', '“a”', '“b”', '“c”'])
  })
  it('is a plain list: no totals row and no marks', () => {
    const c = searchCard({ story: { cur: sr([{ key: 'old', clicks: 30 }, { key: 'fresh one', clicks: 8 }]), prev: sr([{ key: 'old', clicks: 30 }]) }, domain: 'x.com', rule: '' })
    const rows = c?.vis?.k === 'rcpt' ? c.vis.rows : []
    expect(c?.vis).toMatchObject({ plain: true })
    expect(rows.some((r) => r.tot || r.flag || r.mark)).toBe(false)
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

describe('the signup path and a first customer', () => {
  const steps = [
    { name: '/', v: 400, c: 380 },
    { name: '/pricing', v: 120, c: 150 },
    { name: 'signup', v: 12, c: 60 },
  ]
  it('names the step where fewer go on than usual, and what usually goes on there', () => {
    const c = leakCard({ f: { steps, leak: { at: 2, r: 0.1, ur: 0.4 }, alt: '/docs' }, domain: 'a.com', rule: 'Rule.' })
    expect(c?.head).toBe('Only 12 of 120 people made it from /pricing to signup')
    expect(c?.rest).toBe(', usually about 48 of 120')
    expect(c?.why).toBe('Many go to /docs instead.')
    expect(c?.vis).toMatchObject({ k: 'funnel', rows: [{ hot: '' }, { hot: '' }, { hot: '10% go on here, usually 40%' }] })
  })
  it('says nothing without a leak, or when too few would have gone on to say so', () => {
    expect(leakCard({ f: { steps, leak: { at: -1, r: 0, ur: 0 } }, domain: 'a.com', rule: '' })).toBeNull()
    expect(leakCard({ f: { steps: [{ name: 'a', v: 6, c: 6 }, { name: 'b', v: 0, c: 3 }], leak: { at: 1, r: 0, ur: 0.4 } }, domain: 'a.com', rule: '' })).toBeNull()
  })
  it('is a card for a country that never had a customer', () => {
    const c = firstCard({ first: { country: 'DE', amount: 2900, at: '2026-10-16T09:05:00Z', referrer: 'news.ycombinator.com', people: 14 }, band: { c: 10, lo: 6, hi: 14 }, fmt: usd, clock: (iso) => iso.slice(11, 16), rule: '' })
    expect(c.head).toBe('Your first customer from Germany')
    expect(c.kc).toMatchObject({ label: 'Germany' })
    expect(c.vis).toEqual({ k: 'journey', steps: [{ l: 'Hacker News' }, { l: '\u{1F1E9}\u{1F1EA} Germany' }, { l: '$29', t: 'New customer · 09:05' }] })
    expect(c.why).toContain('$29 via')
  })
})

describe('the leak with a stuck page', () => {
  it('is the leak card with the page people pressed again and again named in its line, and asks Peek its question', () => {
    const leak = leakCard({ f: { steps: [{ name: '/', v: 100, c: 0 }, { name: '/pricing', v: 60, c: 0 }, { name: 'Paid', v: 3, c: 0 }], leak: { at: 2, r: 0.05, ur: 0.2 } }, domain: 'x.com', rule: '' })
    expect(leak).not.toBeNull()
    const c = withStuck(leak as NonNullable<typeof leak>, { page: '/pricing', views: 400, rage: [{ el: 'button.plan', n: 4 }] })
    expect(c.key).toBe('funnel')
    expect(c.why).toContain('People also pressed button.plan on /pricing 4 times in a row.')
    expect(c.ask).toBe('Why do fewer people go from /pricing to Paid than usual?')
  })
})
