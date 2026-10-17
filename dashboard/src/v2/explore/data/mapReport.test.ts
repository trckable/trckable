import { describe, expect, it } from 'vitest'
import type { KPIs, Money, Report, Result } from '../../../lib/api'
import { mapOverview, mapTable, optionsOf } from './mapReport'

const kpis = (visitors: number, extra: Partial<KPIs> = {}): KPIs => ({ visitors, sessions: visitors, pageviews: visitors * 2, bounce_rate: 0.45, avg_session_s: 60, views_per_session: 2, new_visitor_share: 0.5, ...extra })
const hours = (xs: number[]) => xs.map((visitors, h) => ({ t: `2026-10-16T${String(h).padStart(2, '0')}:00`, visitors, pageviews: visitors * 2 }))
const result = (visitors: number, o: Partial<Result> = {}): Result => ({ approximate: false, kpis: kpis(visitors), series: hours([1, 2, 3, 4]), dims: {}, goals: null, ...o })
const report = (cur: Result, prev?: Result): Report => ({ site: 's', timezone: 'UTC', bucket: 'hour', from: '2026-10-16', to: '2026-10-16', current: cur, previous: prev })
const money = (revenue: number): Money => ({ currency: 'USD', exponent: 2, revenue, refunds: 0, payments: 2, customers: 2, paying_visitors: 2, conversion: 0.01, revenue_per_visitor: 1, new_revenue: revenue, renewal_revenue: 0, unattributed: 0, unconverted: 0 })
const none = { uptime: null, now: '2026-10-16' }

describe('the overview', () => {
  it('has four cards: people, views without a goal, uptime without revenue, and who left', () => {
    const o = mapOverview(report(result(100), result(100)), none)
    expect(o.kcs.map((k) => k.icon)).toEqual(['people', 'click', 'uptime', 'leave'])
    expect(o.kcs[0]).toMatchObject({ val: '100', note: { c: '', t: 'as usual' } })
  })
  it('says how far people are from usual against the period before', () => {
    const o = mapOverview(report(result(200), result(100)), none)
    expect(o.kcs[0]).toMatchObject({ note: { c: 'up', t: '+100% vs usual' }, st: '' })
    expect(mapOverview(report(result(40), result(100)), none).kcs[0]).toMatchObject({ note: { c: 'dn' }, st: 'dn' })
  })
  it('names the first goal that anyone reached, and puts money in the third place when it is on', () => {
    const cur = result(100, { goals: [{ value: 'signup', label: 'signed up', visitors: 12 }], money: money(30500) })
    const o = mapOverview(report(cur, result(100)), { ...none, money: (m) => `$${m / 100}` })
    expect(o.kcs[1]).toMatchObject({ icon: 'goal', label: 'Signed up', val: '12' })
    expect(o.kcs[2]).toMatchObject({ icon: 'money', val: '$305', unit: 'net' })
  })
  it('says what the incident record found', () => {
    const o = mapOverview(report(result(100)), { ...none, uptime: { pct: 99.5, down: [{ from: '11:40', to: '12:03', min: 23 }], lost: 1380 } })
    expect(o.kcs[2]).toMatchObject({ icon: 'uptime', val: '99.50%', note: { c: 'dn', t: 'down 23 min' }, st: 'dn' })
    expect(o.down).toHaveLength(1)
    expect(mapOverview(report(result(100)), none).kcs[2]).toMatchObject({ val: '–', note: { t: 'checks are off' } })
  })
  it('draws the shape of the period from the series, ending at now on today', () => {
    const o = mapOverview(report(result(100)), none)
    expect(o.shape).toEqual({ pts: [1, 2, 3, 4], x: ['00:00', '02:00', 'now'] })
    expect(o.per).toBe('hour')
    expect(mapOverview(report(result(100, { series: hours([5]) })), none).shape).toBeNull()
  })
  it('shows a dash for who left when there were too few visits to say', () => {
    expect(mapOverview(report(result(5)), none).kcs[3].val).toBe('–')
  })
})

describe('the tables', () => {
  const cur = result(100, {
    dims: {
      page: [
        { value: '/', visitors: 60 },
        { value: '/pricing', visitors: 40 },
      ],
      country: [{ value: 'DE', visitors: 30 }],
      channel: [{ value: 'Search', visitors: 20 }],
      referrer: [{ value: 'www.google.com', visitors: 20 }],
    },
  })
  const rep = report(cur, result(100, { dims: { page: [{ value: '/', visitors: 20 }] } }))
  it('lists the pages against the period before', () => {
    const t = mapTable('pages', rep)
    expect(t.dim).toBe('page')
    expect(t.rows[0]).toMatchObject({ val: '/', v: 60, c: 20, st: 'up' })
  })
  it('says a country by its name and its code, a channel by its label, a referrer by its host', () => {
    expect(mapTable('countries', rep).rows[0]).toMatchObject({ name: 'Germany', code: 'DE' })
    expect(mapTable('sources', rep)).toMatchObject({ dim: 'channel', rows: [{ name: 'Search' }] })
    expect(mapTable('referrers', rep).rows[0].name).toBe('google.com')
  })
  it('has rows that only read for browsers, and nothing for a tab that is not a table', () => {
    expect(mapTable('browsers', rep).dim).toBeUndefined()
    expect(mapTable('overview', rep).rows).toEqual([])
  })
  it('gives each filter the values the period saw', () => {
    const o = optionsOf(cur)
    expect(o.page?.map((x) => x.val)).toEqual(['/', '/pricing'])
    expect(o.country?.[0]).toEqual({ val: 'DE', name: 'Germany' })
    expect(o.device).toEqual([])
  })
})

describe('the deep tables', () => {
  const dims = { region: [{ value: 'Bavaria', visitors: 40 }], city: [{ value: 'Munich', visitors: 30 }], exit_page: [{ value: '/pricing', visitors: 20 }], group: [{ value: '/blog', visitors: 50 }], language: [{ value: 'de', visitors: 60 }], browser_version: [{ value: 'Chrome 120', visitors: 10 }], screen: [{ value: '1025–1440', visitors: 15 }], source: [{ value: 'newsletter', visitors: 12 }], medium: [{ value: 'email', visitors: 12 }] }
  const tabs = ['regions', 'cities', 'exits', 'groups', 'languages', 'bversion', 'screens', 'utmsource', 'medium'] as const
  it('has a table for each breakdown only the deep report has, and a tap on a row filters by it', () => {
    const t = Object.fromEntries(tabs.map((k) => [k, mapTable(k, report(result(100, { dims })))]))
    expect(Object.entries(t).map(([k, v]) => [k, v.rows.length, v.dim])).toEqual([['regions', 1, 'region'], ['cities', 1, 'city'], ['exits', 1, 'exit_page'], ['groups', 1, 'group'], ['languages', 1, 'language'], ['bversion', 1, 'browser_version'], ['screens', 1, 'screen'], ['utmsource', 1, 'source'], ['medium', 1, 'medium']])
  })
  it('gives each row its customers and revenue where payments are connected, and none to pages and sections', () => {
    const cur = result(100, { dims: { ...dims, country: [{ value: 'DE', visitors: 40 }] }, money: money(30500), revenue_dims: { country: [{ value: 'DE', visitors: 40, customers: 2, revenue: 30500 }], group: [{ value: '/blog', visitors: 50, customers: 1, revenue: 100 }] } })
    expect(mapTable('countries', report(cur)).rows[0]).toMatchObject({ cust: 2, rev: 30500 })
    expect(mapTable('groups', report(cur)).rows[0].rev).toBeUndefined()
    expect(mapTable('countries', report(result(100, { dims: { country: [{ value: 'DE', visitors: 40 }] } }))).rows[0].rev).toBeUndefined()
  })
})

