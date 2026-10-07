import { describe, expect, it, vi } from 'vitest'
import type { SiteRow } from '../lib/api'
import { anyPayments, layoutOf, bounceHigh, bounceTenths, fromStart, saveView, savedView, sortBy, startIndex, sumSeries, bounceSeries, summarize } from './allSitesLogic'

const r = (id: string, o: Partial<SiteRow> = {}) => ({ id, domain: id + '.com', name: '', visitors: 0, series: null, online: 0, ...o }) as SiteRow

describe('All sites rules', () => {
  it('starts every chart at the earliest day with a visit', () => {
    const rows = [r('a', { series: [0, 0, 0, 2, 5] }), r('b', { series: [0, 0, 1, 0, 0] })]
    expect(startIndex(rows)).toBe(2)
    expect(fromStart(rows[0].series, 2)).toEqual([0, 2, 5])
  })
  it('keeps the whole period when data covers it, or there is none', () => {
    expect(startIndex([r('a', { series: [1, 0, 2] })])).toBe(0)
    expect(startIndex([r('a')])).toBe(0)
  })
  it('flags bounce from 75% with words', () => {
    expect(bounceHigh(0.75)).toBe(true)
    expect(bounceHigh(0.74)).toBe(false)
    expect(bounceTenths(0.8)).toBe(8)
  })
  it('shows revenue only when a site has payments', () => {
    expect(anyPayments([r('a'), r('b', { revenue: 0 })])).toBe(true)
    expect(anyPayments([r('a')])).toBe(false)
  })
  it('picks cards up to 8 sites, a list beyond, and honours an override', () => {
    expect(layoutOf(8)).toBe('cards')
    expect(layoutOf(9)).toBe('list')
    expect(layoutOf(3, 'list')).toBe('list')
    expect(layoutOf(12, 'x')).toBe('list')
  })
  it('keeps the viewers pick over the count, and the URL over the pick', () => {
    expect(layoutOf(3, null, 'list')).toBe('list')
    expect(layoutOf(20, null, 'cards')).toBe('cards')
    expect(layoutOf(20, 'list', 'cards')).toBe('list')
    expect(layoutOf(20, null, null)).toBe('list')
  })
  it('remembers the picked view and is automatic until then', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) })
    expect(savedView()).toBeNull()
    saveView('list')
    expect(savedView()).toBe('list')
    store.set('tkb_all_view', 'x')
    expect(savedView()).toBeNull()
    vi.unstubAllGlobals()
  })
  it('sorts by visitors and name', () => {
    const rows = [r('b', { visitors: 1 }), r('a', { visitors: 9 })]
    expect(sortBy(rows, 'visitors', new Map()).map((x) => x.id)).toEqual(['a', 'b'])
    expect(sortBy(rows, 'name', new Map()).map((x) => x.id)).toEqual(['a', 'b'])
    expect(sortBy(rows, 'order', new Map([['b', 0], ['a', 1]])).map((x) => x.id)).toEqual(['b', 'a'])
  })

  it('adds each card\'s days up from the shared start', () => {
    const rows = [r('a', { pageview_series: [1, 2, 3] }), r('b', { pageview_series: [10, 20, 30] }), r('c', {})]
    expect(sumSeries(rows, (x) => x.pageview_series, 1)).toEqual([22, 33])
  })

  it('weights each day\'s bounce rate by the sessions behind it, and holds the last rate over a quiet day', () => {
    const rows = [
      r('a', { bounce_series: [1, 0.5, 0], session_series: [1, 2, 0] }),
      r('b', { bounce_series: [0, 0.5, 0], session_series: [3, 2, 0] }),
    ]
    expect(bounceSeries(rows, 0)).toEqual([0.25, 0.5, 0.5])
  })

  it('weights the earlier bounce rate by the earlier visitors', () => {
    const s = summarize([r('a', { previous_visitors: 1, previous_bounce_rate: 1, previous_pageviews: 4 }), r('b', { previous_visitors: 3, previous_bounce_rate: 0, previous_pageviews: 6 })])
    expect(s.previousBounce).toBe(0.25)
    expect(s.previousPageviews).toBe(10)
  })
})
