import { describe, expect, it } from 'vitest'
import type { Point, Result } from '../../lib/api'
import { againstName, capital, changeOf, compareOf, grainOf, hasBefore, sameGrain, pairAt, readOf, signed, startsOn, whyNot, wholeBefore } from './compare'

const pts = (xs: number[], from = 1): Point[] => xs.map((visitors, d) => ({ t: `2026-10-${String(d + from).padStart(2, '0')}T00:00`, visitors, pageviews: visitors }))

const hours = (xs: number[], day = '2026-10-10'): Point[] => xs.map((visitors, h) => ({ t: `${day}T${String(h % 24).padStart(2, '0')}:00`, visitors, pageviews: visitors }))

describe('the comparison', () => {
  it('only sets a series against one of the same bucket size', () => {
    expect(grainOf(pts([1, 2]))).toBe(1440)
    expect(grainOf(hours([1, 2]))).toBe(60)
    expect(sameGrain(pts([1, 2, 3]), pts([4, 5, 6]))).toBe(true)
    expect(sameGrain(hours([1, 2, 3]), pts([4, 5, 6]))).toBe(false)
  })
  it('a week by the hour against a week by the day gives no comparison, never a short line', () => {
    const week = hours(Array.from({ length: 168 }, () => 100))
    const daily = pts([1500, 1700, 2000, 1800, 1600, 1500, 1400])
    expect(compareOf(week, daily, 168, 'last week')).toBeNull()
  })
  it('a week by the hour against a week by the hour has equal lengths and a true change', () => {
    const now = hours(Array.from({ length: 168 }, () => 120))
    const before = hours(Array.from({ length: 168 }, () => 100), '2026-10-03')
    const c = compareOf(now, before, 168, 'last week')
    expect(c?.vals).toHaveLength(168)
    expect(c?.pct).toBe(20)
  })
  it('a month by the day against a month by the day has equal lengths and a true change', () => {
    const c = compareOf(pts(Array.from({ length: 30 }, () => 90)), pts(Array.from({ length: 30 }, () => 100)), 30, 'last month')
    expect(c?.vals).toHaveLength(30)
    expect(c?.pct).toBe(-10)
  })
  it('a day still going is told against the start of the day before', () => {
    expect(compareOf(hours(Array.from({ length: 24 }, () => 5)), hours([5, 5, 5, 5]), 4, 'yesterday')?.pct).toBe(0)
  })
  it('names the period before the way a person says it', () => {
    const r = { from: '2026-10-01', to: '2026-10-30' }
    expect(againstName('30d', 'previous', r)).toBe('last month')
    expect(againstName('7d', 'previous', r)).toBe('last week')
    expect(againstName('today', 'previous', r)).toBe('yesterday')
    expect(againstName('90d', 'previous', { from: '2026-07-01', to: '2026-09-28' })).toBe('the 90 days before')
    expect(capital('last month')).toBe('Last month')
  })
  it('writes a change with its sign, and none when nobody was there before', () => {
    expect([signed(18), signed(-7), signed(0)]).toEqual(['+18%', '-7%', '0%'])
    expect(changeOf(130, 100)).toBe(30)
    expect(changeOf(5, 0)).toBeNull()
  })
  it('has a before only when the site was seen in the first half of it', () => {
    expect(hasBefore(pts([0, 5, 6, 7]))).toBe(true)
    expect(hasBefore(pts([0, 0, 0, 7]))).toBe(false)
    expect(hasBefore(pts([0, 0, 0, 0]))).toBe(false)
    expect(hasBefore(undefined)).toBe(false)
  })
  it('counts only the buckets that are over, against the same buckets before', () => {
    expect(compareOf(pts([10, 20, 99]), pts([10, 10, 10]), 2, 'last week')).toEqual({ name: 'last week', vals: [10, 10, 10], pct: 50 })
    expect(compareOf(pts([10]), undefined, 1, 'x')).toBeNull()
  })
  it('begins a whole period after the first visit', () => {
    expect(startsOn(pts([0, 0, 40, 50], 10), pts([0, 0, 0, 0], 6))).toBe('Oct 16')
    expect(startsOn(pts([0, 0]), pts([0, 0]))).toBeNull()
  })
})

describe('the hover and the reason', () => {
  const c = { name: 'last month', vals: [270, 100], pct: null }
  it('reads a bucket against the same one before, with the change', () => {
    expect(pairAt(c, 312, 0, 2)).toEqual({ was: 270, delta: 16 })
    expect(readOf('Oct 6', 312, 'last month', 270, 16)).toBe('Oct 6 · 312 visitors · last month 270 · +16%')
  })
  it('tells no change for the bucket still going, and none for a bucket with nothing before it', () => {
    expect(pairAt(c, 50, 1, 1)).toEqual({ was: 100, delta: null })
    expect(pairAt(c, 50, 5, 9)).toEqual({ was: null, delta: null })
    expect(pairAt(null, 50, 0, 9)).toEqual({ was: null, delta: null })
    expect(readOf('Oct 6', 312, null, null, null)).toBe('Oct 6 · 312 visitors')
  })
  it('says when the comparison begins when there is too little before, and nothing when it can be drawn', () => {
    const now = pts(Array.from({ length: 10 }, () => 5), 11)
    expect(whyNot(now, pts([0, 0, 0, 0, 0, 0, 0, 0, 0, 5]))).toMatch(/^Comparison starts /)
    expect(whyNot(now, pts(Array.from({ length: 10 }, () => 4)))).toBeNull()
    expect(whyNot(now, undefined)).toBeNull()
  })
})

describe('the period before, whole', () => {
  const r = { approximate: false, kpis: { visitors: 7 }, series: [{ t: '2026-10-15T00:00', visitors: 1, pageviews: 1 }], dims: {}, goals: null } as unknown as Result
  const whole: Point[] = [r.series[0], { t: '2026-10-15T01:00', visitors: 2, pageviews: 2 }]
  it('draws every bucket the server sent while its figures stay those of the elapsed part', () => {
    const w = wholeBefore(r, whole)
    expect(w?.series).toEqual(whole)
    expect(w?.kpis.visitors).toBe(7)
  })
  it('is the report as it was when the server sent no whole series, or there is no report', () => {
    expect(wholeBefore(r, undefined)).toBe(r)
    expect(wholeBefore(undefined, whole)).toBeUndefined()
  })
})
