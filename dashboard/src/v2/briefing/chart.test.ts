import { describe, expect, it } from 'vitest'
import type { Point, Result } from '../../lib/api'
import { chartOf, siteNow } from './chart'
import { chartNote, chartTone } from '../ui/chartNote'

const pts = (xs: number[]): Point[] => xs.map((visitors, h) => ({ t: `2026-10-16T${String(h).padStart(2, '0')}:00`, visitors, pageviews: visitors }))
const res = (xs: number[]): Result => ({ approximate: false, kpis: { visitors: 0, sessions: 0, pageviews: 0, bounce_rate: 0, avg_session_s: 0, views_per_session: 0, new_visitor_share: 0 }, series: pts(xs), dims: {}, goals: null })

describe('the chart of a day', () => {
  const day = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]
  it('stops at the hour it is and shades the hours still to come, with the axis running to the end of the day', () => {
    const c = chartOf({ cur: res(day), prev: res(day), bucket: 'hour', unit: 'today', nowT: '2026-10-16T09:30' })
    expect(c.live).toBe(true)
    expect(c.points).toHaveLength(10)
    expect(c.span).toBe(24)
    expect(c.points[0].name).toBe('00:00')
  })
  it('a site whose clock is just past midnight still draws the whole day, not the first few hours', () => {
    const c = chartOf({ cur: res(day), prev: res(day), bucket: 'hour', unit: 'today', nowT: '2026-10-16T00:12' })
    expect(c.span).toBe(24)
    expect(c.points).toHaveLength(1)
    expect(c.elapsed).toBeCloseTo(0.2, 1)
    expect(c.axis[23].tick).toBe('23:00')
  })
  it('a whole past day has every hour and nothing to come', () => {
    const c = chartOf({ cur: res(day), prev: res(day), bucket: 'hour', unit: 'yesterday', nowT: '2026-10-17T09:30' })
    expect(c.live).toBe(false)
    expect(c.points).toHaveLength(24)
  })
  it('lifts the hour that is part-way to its full-hour pace, but leaves a barely started one', () => {
    expect(chartOf({ cur: res([0, 10]), prev: res([0, 0]), bucket: 'hour', unit: 'today', nowT: '2026-10-16T01:30' }).points[1].v).toBe(20)
    expect(chartOf({ cur: res([0, 10]), prev: res([0, 0]), bucket: 'hour', unit: 'today', nowT: '2026-10-16T01:05' }).points[1].v).toBe(10)
  })
  it('labels the biggest rise above the band with its source', () => {
    const c = chartOf({ cur: res([5, 5, 40, 5]), prev: res([5, 5, 5, 5]), bucket: 'hour', unit: 'yesterday', riseName: 'Hacker News' })
    expect(c.rise?.i).toBe(2)
    expect(c.rise?.text).toMatch(/^Hacker News · \d+(\.\d)?× a usual hour$/)
  })
  it('has no band without enough of the period before', () => {
    expect(chartOf({ cur: res([1, 2, 3, 4]), prev: res([1]), bucket: 'hour', unit: 'yesterday' }).band).toBe(false)
  })
  it('reads the site clock in its zone', () => {
    expect(siteNow('UTC', new Date('2026-10-16T09:30:00Z'))).toBe('2026-10-16T09:30')
    expect(siteNow('Asia/Tokyo', new Date('2026-10-16T20:00:00Z'))).toBe('2026-10-17T05:00')
  })
})

describe('the period before on the chart', () => {
  const days = (xs: number[]): Point[] => xs.map((visitors, d) => ({ t: `2026-10-${String(d + 1).padStart(2, '0')}T00:00`, visitors, pageviews: visitors }))
  const result = (xs: number[]): Result => ({ ...res([]), series: days(xs) })
  const cur = [120, 130, 90, 150]
  const before = [100, 100, 100, 100]

  it('lines each bucket up with the same bucket of the report the line comes from', () => {
    const c = chartOf({ cur: result(cur), prev: result(before), bucket: 'day', unit: 'month', against: 'last month' })
    expect(c.compare?.vals).toEqual(before)
    expect(c.points.map((p) => p.was)).toEqual(before)
    expect(c.points[3].delta).toBe(50)
  })
  it('reads one point as the number, the one before and the change, and says nothing about a usual range', () => {
    const c = chartOf({ cur: result(cur), prev: result([1910, 100, 100, 100]), bucket: 'day', unit: 'month', against: 'last month' })
    const at = chartNote(c, 0)
    expect(at).toContain('120 visitors')
    expect(at).toContain('last month 1,910')
    expect(at).toContain('-94%')
    expect(at).not.toMatch(/usual|0–0/)
  })
  it('says how the period stands over the line, from the buckets that are over', () => {
    const c = chartOf({ cur: result(cur), prev: result(before), bucket: 'day', unit: 'month', against: 'last month' })
    expect(c.compare?.pct).toBe(23)
    expect(chartNote(c, null)).toBe('+23% vs last month')
    expect(chartTone(c, null)).toBe('up')
    expect(chartTone(c, 0)).toBeUndefined()
    expect(chartTone(chartOf({ cur: result([50, 50]), prev: result([100, 100]), bucket: 'day', unit: 'month', against: 'last month' }), null)).toBe('dn')
  })
  it('leaves out the bucket still going', () => {
    const c = chartOf({ cur: result([100, 100, 10]), prev: result([100, 100, 100]), bucket: 'day', unit: 'month', against: 'last month', nowT: '2026-10-03T09:00' })
    expect(c.compare?.pct).toBe(0)
    expect(c.points[2].delta).toBeNull()
  })
  it('draws no line and says when it begins while most of the period before is ahead of the first visit', () => {
    const c = chartOf({ cur: result([0, 0, 0, 40, 50, 60]), prev: result([0, 0, 0, 0, 0, 0]), bucket: 'day', unit: 'month', against: 'last month' })
    expect(c.compare).toBeNull()
    expect(c.noCompare).toBe('Comparison starts Oct 10, once there’s a month of data'.replace('’', "'"))
    expect(chartNote(c, null)).toBe(c.noCompare)
    expect(chartNote(c, 4)).not.toMatch(/usual|0–0/)
  })
  it('asks for nothing when no comparison is asked for', () => {
    const c = chartOf({ cur: result(cur), prev: result(before), bucket: 'day', unit: 'month' })
    expect(c.compare).toBeNull()
    expect(c.noCompare).toBeNull()
  })
})
