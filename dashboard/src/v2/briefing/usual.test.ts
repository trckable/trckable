import { describe, expect, it } from 'vitest'
import type { Point } from '../../lib/api'
import { dayBandOf, hourTable, judge, stretchBand } from './usual'

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
