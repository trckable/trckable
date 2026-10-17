import { describe, expect, it } from 'vitest'
import type { CrawlerReport, FunnelResult, Money, Report, SearchReport, WebVitals } from '../../../lib/api'
import type { Mention as ApiMention } from '../../../features/mentions/api'
import { gradeOf, leakOf, mapBots, mapFunnel, mapLinks, mapMentions, mapSales, mapSearch, mapSpeed, stepsOf } from './mapSections'

const step = (value: string, visitors: number): FunnelResult => ({ kind: 'page', value, visitors, rate: 1, of_total: 1, median_s: 0, dropped: 0 })
const kpis = { visitors: 100, sessions: 100, pageviews: 200, bounce_rate: 0.4, avg_session_s: 60, views_per_session: 2, new_visitor_share: 0.5 }
const report = (goals: Report['current']['goals'], prev = true): Report => ({
  site: 's',
  timezone: 'UTC',
  bucket: 'day',
  from: 'a',
  to: 'b',
  current: { approximate: false, kpis, series: [], dims: { page: [{ value: '/', visitors: 80 }] }, goals },
  previous: prev ? { approximate: false, kpis, series: [], dims: { page: [{ value: '/', visitors: 40 }] }, goals: [{ value: 'signup', visitors: 10 }] } : undefined,
})

describe('where people leave', () => {
  it('finds the first step where fewer go on than usual', () => {
    const steps = [
      { name: 'a', v: 100, c: 100 },
      { name: 'b', v: 50, c: 50 },
      { name: 'c', v: 5, c: 25 },
    ]
    expect(leakOf(steps)).toEqual({ at: 2, r: 0.1, ur: 0.5 })
  })
  it('finds none when each step goes on as usual, or there are too few to say', () => {
    expect(leakOf([{ name: 'a', v: 100, c: 100 }, { name: 'b', v: 50, c: 50 }]).at).toBe(-1)
    expect(leakOf([{ name: 'a', v: 4, c: 40 }, { name: 'b', v: 0, c: 20 }]).at).toBe(-1)
  })
})

describe('the funnel', () => {
  it('names the steps, sets each against the period before and lists the goals and the pages', () => {
    const f = mapFunnel({ cur: [step('/', 100), step('/pricing', 40)], prev: [step('/', 90), step('/pricing', 45)], report: report([{ value: 'signup', label: 'Signed up', visitors: 12 }]), ghost: true })
    expect(f.steps).toEqual([
      { name: '/', v: 100, c: 90 },
      { name: '/pricing', v: 40, c: 45 },
    ])
    expect(f.goals[0]).toMatchObject({ name: 'Signed up', v: 12, c: 10, st: '' })
    expect(f.pages[0]).toMatchObject({ name: '/', v: 80, c: 40, st: 'up' })
    expect(f).toMatchObject({ ghost: true, goalsOn: true })
  })
  it('has no goals on when the site has none', () => {
    expect(mapFunnel({ cur: [], report: report(null, false), ghost: false }).goalsOn).toBe(false)
  })
})

describe('sales', () => {
  const m = { new_revenue: 8700, renewal_revenue: 0, refunds: 500 } as Money
  it('has nothing to say until payments are connected', () => {
    expect(mapSales(undefined, 'Today').state).toBe('connect')
  })
  it('lists what each kind earned, and leaves out a kind that earned nothing', () => {
    const s = mapSales(m, 'Today')
    expect(s.state).toBe('ok')
    expect(s.sales.map((x) => [x.kind, x.amt, x.when])).toEqual([
      ['new', 8700, 'Today'],
      ['refund', -500, 'Today'],
    ])
  })
})

describe('search', () => {
  const rep = (clicks: number, impressions: number, rows: SearchReport['rows']): SearchReport => ({ property: 'p', dim: 'query', rows, from: '', to: '', clicks, impressions, preliminary_from: '', ignored_filters: null })
  const q = rep(120, 4000, [
    { key: 'trckable', clicks: 80, impressions: 800, ctr: 0.1, position: 1.5 },
    { key: 'new one', clicks: 40, impressions: 3200, ctr: 0.0125, position: 8 },
  ])
  it('sets clicks, impressions, the click rate and the position against the period before', () => {
    const prev = rep(60, 4000, [{ key: 'trckable', clicks: 60, impressions: 4000, ctr: 0.015, position: 3 }])
    const s = mapSearch({ query: q, pages: q, prev })
    expect(s.kcs.map((k) => [k.label, k.val, k.tag, k.tone])).toEqual([
      ['Clicks', '120', 'above usual', 'up'],
      ['Impressions', '4.0k', 'as usual', ''],
      ['Click rate', '3.0%', 'as usual', ''],
      ['Position', '6.7', 'below usual', 'dn'],
    ])
    expect(s.kcs[0].detail).toBe('usual 45–76')
  })
  it('marks a query that was not there before as new, in quotes', () => {
    const s = mapSearch({ query: q, pages: q, prev: rep(60, 4000, [{ key: 'trckable', clicks: 60, impressions: 4000, ctr: 0.015, position: 3 }]) })
    expect(s.queries.map((r) => [r.name, r.fresh])).toEqual([
      ['“trckable”', undefined],
      ['“new one”', true],
    ])
  })
  it('is not enough when Google has sent nobody', () => {
    expect(mapSearch({ query: rep(0, 0, null), pages: rep(0, 0, null) }).enough).toBe(false)
  })
})

describe('speed', () => {
  const v = (lcp: number | null, inp: number | null, cls: number | null, pages: WebVitals['pages'] = []): WebVitals => ({ samples: 40, lcp_ms: lcp, inp_ms: inp, cls_1k: cls, good: 0.5, pages })
  it('grades by the measures Google uses', () => {
    expect(gradeOf(0, 2.1)).toBe('good')
    expect(gradeOf(0, 3.4)).toBe('mid')
    expect(gradeOf(0, 5)).toBe('poor')
    expect(gradeOf(1, 243)).toBe('mid')
    expect(gradeOf(2, 0.05)).toBe('good')
  })
  it('says each measure against the usual, and the slowest pages first', () => {
    const s = mapSpeed(v(3400, 243, 90, [{ value: '/a', visitors: 2000 }, { value: '/b', visitors: 5000 }]), v(2100, 180, 50))
    expect(s.kcs.map((k) => [k.val, k.detail, k.tone])).toEqual([
      ['3.4 s', 'usual 2.1 s · Needs work', 'dn'],
      ['243 ms', 'usual 180 ms · Needs work', 'dn'],
      ['0.09', 'usual 0.05 · Good', ''],
    ])
    expect(s.pages.map((p) => [p.name, p.val, p.grade])).toEqual([
      ['/b', '5.0 s', 'poor'],
      ['/a', '2.0 s', 'good'],
    ])
  })
  it('says nothing was measured rather than zero', () => {
    expect(mapSpeed(v(null, null, null)).kcs[0]).toMatchObject({ val: '–', detail: 'nothing measured yet' })
  })
})

describe('mentions, robots and links', () => {
  it('lists mentions newest first in the site day, leaving comments out', () => {
    const m = (id: number, posted: number, extra: Partial<ApiMention> = {}): ApiMention => ({ id, source: 'hn', url: '', title: `t${id}`, host: 'news.ycombinator.com', points: 5, comments: 2, posted_at: posted, found_at: posted, visitors: 0, ...extra })
    const day = Date.UTC(2026, 9, 16, 14, 5) / 1000
    const out = mapMentions([m(1, day - 86400 * 3), m(2, day), m(3, day, { kind: 'comment' })], 'UTC', '2026-10-16')
    expect(out.map((x) => [x.title, x.src, x.when])).toEqual([
      ['t2', 'Hacker News', '14:05'],
      ['t1', 'Hacker News', 'Oct 13 14:05'],
    ])
  })
  it('lists the robots by what they read, most first', () => {
    const r = { series: [{ name: 'a', kind: 'k', total: 3, values: [] }, { name: 'b', kind: 'k', total: 9, values: [] }, { name: 'c', kind: 'k', total: 0, values: [] }] } as unknown as CrawlerReport
    expect(mapBots(r).map((b) => b.name)).toEqual(['b', 'a'])
  })
  it('lists outbound links from the url property only', () => {
    const rows = mapLinks([
      { key: 'url', value: 'github.com/x', visitors: 4 },
      { key: 'plan', value: 'pro', visitors: 9 },
      { key: 'url', value: 'docs.x.com', visitors: 7 },
    ])
    expect(rows.map((r) => r.name)).toEqual(['docs.x.com', 'github.com/x'])
  })
})

describe('the funnel an old address names', () => {
  const pages = [{ value: '/' }, { value: '/pricing' }, { value: '/docs' }]
  it('keeps the steps of fs= when there are two or more', () => {
    const fs = [{ kind: 'page' as const, value: '/docs' }, { kind: 'goal' as const, value: 'signup' }]
    expect(stepsOf(fs, pages, { value: 'x' })).toEqual(fs)
  })
  it('suggests the two busiest pages and the first goal otherwise', () => {
    expect(stepsOf(undefined, pages, { value: 'signup' })).toEqual([
      { kind: 'page', value: '/' },
      { kind: 'page', value: '/pricing' },
      { kind: 'goal', value: 'signup' },
    ])
    expect(stepsOf([{ kind: 'page', value: '/' }], pages)).toHaveLength(2)
  })
})
