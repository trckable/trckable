import { describe, expect, it } from 'vitest'
import { firstVisitAt, hourIn, hourlySpan } from './firstVisit'

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
