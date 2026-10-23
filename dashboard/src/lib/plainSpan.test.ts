import { describe, expect, it } from 'vitest'
import { plainSpan } from './plainSpan'

describe('plainSpan', () => {
  it('says minutes, hours and days the way people do', () => {
    expect(plainSpan(0)).toBe('1 min')
    expect(plainSpan(12 * 60)).toBe('12 min')
    expect(plainSpan(3 * 3600 + 5 * 60)).toBe('3 h 5 min')
    expect(plainSpan(2 * 3600)).toBe('2 h')
    expect(plainSpan(2779 * 60)).toBe('1 day 22 h')
    expect(plainSpan(48 * 3600)).toBe('2 days')
  })
})
