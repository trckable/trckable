import { describe, expect, it } from 'vitest'
import type { SiteRow } from '../lib/api'
import { anyPayments, layoutOf, bounceHigh, bounceTenths, fromStart, sortBy, startIndex } from './allSitesLogic'

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
  it('sorts by visitors and name', () => {
    const rows = [r('b', { visitors: 1 }), r('a', { visitors: 9 })]
    expect(sortBy(rows, 'visitors', new Map()).map((x) => x.id)).toEqual(['a', 'b'])
    expect(sortBy(rows, 'name', new Map()).map((x) => x.id)).toEqual(['a', 'b'])
    expect(sortBy(rows, 'order', new Map([['b', 0], ['a', 1]])).map((x) => x.id)).toEqual(['b', 'a'])
  })
})
