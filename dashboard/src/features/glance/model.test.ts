import { describe, expect, it } from 'vitest'
import type { Report, Result, Row } from '../../lib/api'
import { modelOf } from './model'

const rows = (xs: [string, number, number?][]): Row[] => xs.map(([value, visitors, bounce_rate]) => ({ value, visitors, bounce_rate }))

const result = (over: Partial<Result> = {}): Result => ({
  approximate: false,
  kpis: { visitors: 1000, sessions: 1200, pageviews: 2500, bounce_rate: 0.8, avg_session_s: 238, views_per_session: 2, new_visitor_share: 0.5 },
  series: Array.from({ length: 10 }, (_, i) => ({ t: `2026-09-${String(i + 1).padStart(2, '0')}T00:00`, visitors: 100, pageviews: 250 })),
  dims: {
    channel: rows([['Search', 600], ['Direct', 300], ['Social', 100]]),
    entry_page: rows([['/blog/a', 700, 0.9], ['/', 300, 0.4]]),
    device: rows([['Mobile', 640], ['Desktop', 360]]),
    country: rows([['DE', 500], ['US', 300], ['FR', 200]]),
  },
  goals: null,
  ...over,
})

const report = (cur = result(), prev?: Result): Report => ({ site: 's', timezone: 'UTC', bucket: 'day', from: '2026-09-01', to: '2026-09-10', current: cur, previous: prev })

const run = (r: Report, money?: (n: number) => string) => modelOf({ data: r, today: '2026-10-06', now: Date.UTC(2026, 9, 6), money })

function must<T>(x: T | undefined): T {
  if (x === undefined) throw new Error('missing')
  return x
}

describe('modelOf', () => {
  const m = run(report())
  const tile = (k: string) => must(m.tiles.find((t) => t.key === k))
  it('has the eight tiles in order', () => {
    expect(m.tiles.map((t) => t.key)).toEqual(['source', 'carrying', 'staying', 'reading', 'device', 'country', 'goals', 'revenue'])
  })
  it('names the top source and its share', () => {
    expect(tile('source').value).toBe('Search')
    expect(tile('source').meaning).toBe('60% found you on Search. Direct brings 30%.')
  })
  it('flags a high leave rate in amber and fires the alert', () => {
    expect(tile('staying').tone).toBe('warn')
    expect(tile('staying').meaning).toBe('8 in 10 read one page and go.')
    expect(m.alert?.tile).toBe('staying')
  })
  it('says one article when one page starts most visits', () => {
    expect(tile('carrying').value).toBe('1 article')
  })
  it('reads the device and the countries', () => {
    expect(tile('device').meaning).toContain('64% on a phone')
    expect(tile('country').meaning).toBe('50% of readers. United States and France follow.')
  })
  it('sets up goals and revenue when there are none', () => {
    expect(tile('goals').setup).toBe('goal')
    expect(tile('goals').value).toBe('Not set')
    expect(tile('revenue').setup).toBe('revenue')
    expect(tile('revenue').tone).toBe('dim')
  })
  it('shows a goal once one is counted', () => {
    const t = must(run(report(result({ goals: rows([['signup', 42]]) }))).tiles.find((x) => x.key === 'goals'))
    expect(t.setup).toBeUndefined()
    expect(t.value).toBe('signup')
  })
  it('counts revenue when sales exist', () => {
    const money = { currency: 'USD', exponent: 2, revenue: 120000, refunds: 0, payments: 3, customers: 3, paying_visitors: 3, conversion: 0, revenue_per_visitor: 0, new_revenue: 0, renewal_revenue: 0, unattributed: 0, unconverted: 0 }
    const t = must(run(report(result({ money, revenue_dims: { channel: [{ value: 'Search', visitors: 0, revenue: 90000 }] } })), (n) => `$${n / 100}`).tiles.find((x) => x.key === 'revenue'))
    expect(t.value).toBe('$1200')
    expect(t.meaning).toContain('Search')
  })
  it('lists table rows biggest first with their leave rate', () => {
    expect(tile('carrying').rows[0]).toEqual({ key: '/blog/a', label: '/blog/a', visitors: 700, leave: 0.9 })
  })
  it('has no comparisons yet without an earlier period, and says when they start', () => {
    expect(m.comparisonsFrom).toBe('2026-09-11')
  })
  it('marks today as partial and leaves it out of the best day', () => {
    const r = report()
    r.to = '2026-10-06'
    r.current.series[9].visitors = 999
    const x = run(r)
    expect(x.days[9].partial).toBe(true)
    expect(x.best?.visitors).toBe(100)
  })
  it('degrades with no data', () => {
    const e = run(report(result({ kpis: { ...result().kpis, visitors: 0, bounce_rate: 0 }, series: [], dims: {} })))
    expect(e.empty).toBe(true)
    expect(e.tiles[0].value).toBe('–')
    expect(e.tiles[0].meaning).toBe('No data for this yet.')
  })
})
