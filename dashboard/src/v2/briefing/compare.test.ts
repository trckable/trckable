import { describe, expect, it } from 'vitest'
import type { Point } from '../../lib/api'
import { againstName, capital, changeOf, compareOf, hasBefore, signed, startsOn } from './compare'

const pts = (xs: number[], from = 1): Point[] => xs.map((visitors, d) => ({ t: `2026-10-${String(d + from).padStart(2, '0')}T00:00`, visitors, pageviews: visitors }))

describe('the comparison', () => {
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
