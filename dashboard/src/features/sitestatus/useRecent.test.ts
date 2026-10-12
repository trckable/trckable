import { describe, expect, it } from 'vitest'
import { HOURS, slicesOf } from './useRecent'

describe('the last day by the hour', () => {
  it('counts visits into hourly slots, the last being this hour, and drops older ones', () => {
    const now = 1_800_000_000
    const s = slicesOf([now - 10, now - 3700, now - 3800, now - 23 * 3600, now - 30 * 3600], now)
    expect(s).toHaveLength(HOURS)
    expect(s[HOURS - 1]).toBe(1)
    expect(s[HOURS - 2]).toBe(2)
    expect(s[0]).toBe(1)
    expect(s.reduce((a, b) => a + b, 0)).toBe(4)
  })
})
