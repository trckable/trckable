import { describe, expect, it } from 'vitest'
import type { Point, Result } from '../../lib/api'
import { chartOf, siteNow } from './chart'

const pts = (xs: number[]): Point[] => xs.map((visitors, h) => ({ t: `2026-10-16T${String(h).padStart(2, '0')}:00`, visitors, pageviews: visitors }))
const res = (xs: number[]): Result => ({ approximate: false, kpis: { visitors: 0, sessions: 0, pageviews: 0, bounce_rate: 0, avg_session_s: 0, views_per_session: 0, new_visitor_share: 0 }, series: pts(xs), dims: {}, goals: null })

describe('the chart of a day', () => {
  const day = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]
  it('stops at the hour it is and shades the hours still to come', () => {
    const c = chartOf({ cur: res(day), prev: res(day), bucket: 'hour', unit: 'today', nowT: '2026-10-16T09:30', weekday: 'Friday' })
    expect(c.live).toBe(true)
    expect(c.points).toHaveLength(10)
    expect(c.span).toBe(12)
    expect(c.points[0].name).toBe('00:00')
  })
  it('a whole past day has every hour and nothing to come', () => {
    const c = chartOf({ cur: res(day), prev: res(day), bucket: 'hour', unit: 'yesterday', nowT: '2026-10-17T09:30', weekday: 'Friday' })
    expect(c.live).toBe(false)
    expect(c.points).toHaveLength(24)
    expect(c.usualLabel).toBe('usual Friday')
  })
  it('lifts the hour that is part-way to its full-hour pace, but leaves a barely started one', () => {
    expect(chartOf({ cur: res([0, 10]), prev: res([0, 0]), bucket: 'hour', unit: 'today', nowT: '2026-10-16T01:30', weekday: 'Friday' }).points[1].v).toBe(20)
    expect(chartOf({ cur: res([0, 10]), prev: res([0, 0]), bucket: 'hour', unit: 'today', nowT: '2026-10-16T01:05', weekday: 'Friday' }).points[1].v).toBe(10)
  })
  it('labels the biggest rise above the band with its source', () => {
    const c = chartOf({ cur: res([5, 5, 40, 5]), prev: res([5, 5, 5, 5]), bucket: 'hour', unit: 'yesterday', weekday: 'Friday', riseName: 'Hacker News' })
    expect(c.rise?.i).toBe(2)
    expect(c.rise?.text).toMatch(/^Hacker News · \d+(\.\d)?× a usual hour$/)
  })
  it('has no band without enough of the period before', () => {
    expect(chartOf({ cur: res([1, 2, 3, 4]), prev: res([1]), bucket: 'hour', unit: 'yesterday', weekday: 'x' }).band).toBe(false)
  })
  it('reads the site clock in its zone', () => {
    expect(siteNow('UTC', new Date('2026-10-16T09:30:00Z'))).toBe('2026-10-16T09:30')
    expect(siteNow('Asia/Tokyo', new Date('2026-10-16T20:00:00Z'))).toBe('2026-10-17T05:00')
  })
})
