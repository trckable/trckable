import { describe, expect, it } from 'vitest'
import { firstVisitAt, hourIn, hourlySpan, previousWhole } from './firstVisit'

describe('firstVisitAt', () => {
  it('starts at the first visit of a site that began in the period', () => {
    expect(firstVisitAt([0, 0, 0, 92, 1137, 100], 0, false)).toBe(3)
  })
  it('keeps the whole period when the site was there before it', () => {
    expect(firstVisitAt([0, 0, 5, 9], 12, false)).toBe(0)
  })
  it('keeps the whole period when filtered or with nothing to compare', () => {
    expect(firstVisitAt([0, 0, 5], 0, true)).toBe(0)
    expect(firstVisitAt([0, 0, 5], undefined, false)).toBe(0)
  })
  it('has nothing to trim when the first day already had visits, or none did', () => {
    expect(firstVisitAt([3, 0, 5], 0, false)).toBe(0)
    expect(firstVisitAt([0, 0, 0], 0, false)).toBe(0)
  })
})

describe('hourlySpan', () => {
  it('is three days or fewer', () => {
    expect(hourlySpan('2026-09-26', '2026-09-28')).toBe(true)
    expect(hourlySpan('2026-09-28', '2026-09-28')).toBe(true)
    expect(hourlySpan('2026-09-25', '2026-09-28')).toBe(false)
  })
})

describe('hourIn', () => {
  it('is the hour where the site is', () => {
    const now = new Date('2026-09-28T07:40:00Z')
    expect(hourIn('UTC', now)).toBe('2026-09-28T07')
    expect(hourIn('Europe/Berlin', now)).toBe('2026-09-28T09')
    expect(hourIn('America/Los_Angeles', now)).toBe('2026-09-28T00')
  })
})

describe('previousWhole', () => {
  const month = (from: number) => Array.from({ length: 30 }, (_, i) => (i < from ? 0 : 40))
  it('is the period before, there from its first day: a change against it means something', () => {
    expect(previousWhole(month(0), 'day')).toBe(true)
    expect(previousWhole(month(2), 'day')).toBe(true) // a quiet start is not a young site
  })
  it('is not when the site began inside it: three days of a month is no comparison', () => {
    expect(previousWhole(month(27), 'day')).toBe(false) // 168 visitors on the last day only
    expect(previousWhole(month(10), 'day')).toBe(false)
    expect(previousWhole(month(3), 'day')).toBe(false)
  })
  it('is not when nothing happened in it', () => {
    expect(previousWhole(month(30), 'day')).toBe(false)
    expect(previousWhole([], 'week')).toBe(false)
  })
  it('does not mistake a quiet night for a young site, by the hour', () => {
    expect(previousWhole([0, 0, 0, 0, 0, 0, 3, 9, 12], 'hour')).toBe(true)
  })
  it('asks the weeks and months of the same', () => {
    expect(previousWhole([0, 0, 0, 5, 9, 7, 8, 9, 3, 4, 5, 6], 'week')).toBe(false)
    expect(previousWhole([0, 5, 9, 7, 8, 9, 3, 4, 5, 6, 3, 3], 'week')).toBe(true)
  })
})
