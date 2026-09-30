import { describe, expect, it } from 'vitest'
import { monthSoFar, paceOf, roundSig } from './pace'

describe('pace', () => {
  it('says nothing before three whole days have gone', () => {
    expect(monthSoFar('2026-09-01')).toBeNull()
    expect(monthSoFar('2026-09-03')).toBeNull() // two whole days: the 1st and the 2nd
    expect(paceOf(500, '2026-09-03')).toBeNull()
    expect(monthSoFar('2026-09-04')).toEqual({ from: '2026-09-01', to: '2026-09-03' })
  })

  it('spreads the whole days over the days of the month', () => {
    // 19 whole days of September (30 days): 6,000 a day of 19 is 9,473.68 → 9,500 to two figures.
    expect(paceOf(6000, '2026-09-20')).toEqual({ total: 9500, days: 30, gone: 19 })
    // February in a leap year has 29 days.
    expect(paceOf(400, '2028-02-11')).toEqual({ total: 1200, days: 29, gone: 10 })
  })

  it('never counts today, and ends at the month start when the day is the 1st of next month', () => {
    expect(monthSoFar('2026-10-01')).toBeNull()
    expect(monthSoFar('2026-01-05')).toEqual({ from: '2026-01-01', to: '2026-01-04' })
  })

  it('says nothing for a month with nothing in it', () => {
    expect(paceOf(0, '2026-09-20')).toBeNull()
  })

  it('rounds to two significant figures', () => {
    expect([roundSig(9437), roundSig(94), roundSig(9), roundSig(123456), roundSig(0)]).toEqual([9400, 94, 9, 120000, 0])
  })
})
