import { describe, expect, it } from 'vitest'
import { cohortFill, SOLID } from './cohortFill'

describe('cohortFill', () => {
  it('never lands in the band where no text colour passes', () => {
    for (let i = 0; i <= 1000; i++) {
      const f = cohortFill(i / 1000)
      expect(f <= 40 || f >= SOLID).toBe(true)
    }
  })
  it('keeps the ends', () => {
    expect(cohortFill(0)).toBe(0)
    expect(cohortFill(1)).toBe(78)
    expect(cohortFill(0.67)).toBeGreaterThanOrEqual(SOLID)
  })
})
