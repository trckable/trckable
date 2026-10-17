import { describe, expect, it } from 'vitest'
import type { Point } from '../../lib/api'
import { dayBandOf, hourlyPeople, hourTable, judge, stretchBand, verdictOf } from './usual'

describe('usual', () => {
  it('has no table without weeks behind it', () => {
    expect(hourTable([], '2026-10-16')).toBeNull()
  })
  it('the same hour of the same weekday, the middle of the weeks', () => {
    const rows: Point[] = [1, 2, 3, 4].map((w) => ({ t: `${new Date(Date.UTC(2026, 9, 16 - w * 7)).toISOString().slice(0, 10)}T12:00`, visitors: w * 10, pageviews: 0 }))
    const t = hourTable(rows, '2026-10-16')
    if (!t) throw new Error('no table')
    const b = stretchBand(t, [{ day: '2026-10-16', hour: 12, fr: 1 }])
    expect(b.c).toBe(30)
    expect(b.hi).toBeGreaterThan(b.c)
    expect(b.lo).toBeLessThan(b.c)
  })
  it('counts only the share of an hour that has happened', () => {
    const rows: Point[] = [1, 2, 3].map((w) => ({ t: `${new Date(Date.UTC(2026, 9, 16 - w * 7)).toISOString().slice(0, 10)}T12:00`, visitors: 20, pageviews: 0 }))
    const t = hourTable(rows, '2026-10-16')
    if (!t) throw new Error('no table')
    expect(stretchBand(t, [{ day: '2026-10-16', hour: 12, fr: 0.5 }]).c).toBe(10)
  })
  it('judges a figure against its band, with half a person to spare', () => {
    const b = { c: 10, lo: 6, hi: 14 }
    expect(judge(20, b)).toBe('up')
    expect(judge(14.4, b)).toBe('')
    expect(judge(2, b)).toBe('dn')
  })
  it('a day is told against the same weekday of the other days', () => {
    const days = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2026, 8, 17 + i, 12)).toISOString().slice(0, 10))
    const totals = days.map(() => 100)
    const b = dayBandOf(totals, days, 25)
    expect(b?.c).toBe(100)
  })
})

describe('one verdict', () => {
  const band = { c: 800, lo: 720, hi: 880 }
  it('tells hourly sums against an hourly band, the day figure no longer pulled under it', () => {
    // 590 people in the day, 900 summed hour by hour: the old comparison (590) read well under 800, the like-with-like one reads above.
    expect(verdictOf(590, band)?.st).toBe('dn')
    expect(verdictOf(900, band)?.st).toBe('up')
    expect(verdictOf(900, band)?.ratio).toBeCloseTo(1.125)
  })
  it('says nothing without a band', () => {
    expect(verdictOf(5, null)).toBeNull()
  })
  it('adds up only the hours that have happened', () => {
    const series = [8, 9, 10, 11].map((h, i) => ({ t: `2026-10-17T${String(h).padStart(2, '0')}:00`, visitors: 10 * (i + 1), pageviews: 0 }))
    expect(hourlyPeople(series, [8, 9, 10].map((hour) => ({ day: '2026-10-17', hour, fr: 1 })))).toBe(60)
  })
})
