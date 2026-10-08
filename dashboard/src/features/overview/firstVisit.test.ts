import { describe, expect, it } from 'vitest'
import type { Result } from '../../lib/api'
import { hourIn, hourlySpan, noChangeLine, noChangeWhy, previousWhole } from './firstVisit'

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

describe('noChangeWhy', () => {
  const full = Array.from({ length: 30 }, () => 5)
  it('is nothing when the period before is whole and big enough, or had no visits', () => {
    expect(noChangeWhy(150, full, 'day')).toBeNull()
    expect(noChangeWhy(0, full.map(() => 0), 'day')).toBeNull()
  })
  it('says how many days of data a short earlier period had', () => {
    expect(noChangeWhy(40, [...Array.from({ length: 22 }, () => 0), ...Array.from({ length: 8 }, () => 5)], 'day')).toEqual({ why: 'days', n: 8 })
  })
  it('says how few visitors a whole earlier period had', () => {
    expect(noChangeWhy(8, full, 'day')).toEqual({ why: 'few', n: 8 })
  })
})

describe('noChangeLine', () => {
  const before = (visitors: number) => ({ kpis: { visitors, sessions: visitors }, series: [] }) as unknown as Result
  it('says so when the period before had no visitors at all, never nothing', () => {
    expect(noChangeLine(true, before(0), 'day')).toMatch(/only 0 visitors/)
  })
  it('says nothing when no comparison is on, or when it can be told', () => {
    expect(noChangeLine(false, before(0), 'day')).toBe('')
    expect(noChangeLine(true, undefined, 'day')).toBe('')
  })
})
