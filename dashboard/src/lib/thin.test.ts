import { describe, expect, it } from 'vitest'
import { baseEnough, MAX_TIMES, MIN_BASE, MIN_SESSIONS, overCap, tooFew } from './thin'

describe('thin data', () => {
  it('calls a period with fewer than MIN_SESSIONS visits too few', () => {
    expect(tooFew(0)).toBe(true)
    expect(tooFew(MIN_SESSIONS - 1)).toBe(true)
    expect(tooFew(MIN_SESSIONS)).toBe(false)
  })
  it('wants an earlier period of at least MIN_BASE visitors', () => {
    expect(baseEnough(undefined)).toBe(false)
    expect(baseEnough(MIN_BASE - 1)).toBe(false)
    expect(baseEnough(MIN_BASE)).toBe(true)
  })
  it('caps a change over MAX_TIMES the earlier figure', () => {
    expect(overCap(MAX_TIMES * 5, 5)).toBe(false)
    expect(overCap(MAX_TIMES * 5 + 1, 5)).toBe(true)
    expect(overCap(5, 0)).toBe(false)
  })
})
