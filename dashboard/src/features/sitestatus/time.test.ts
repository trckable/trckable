import { describe, expect, it } from 'vitest'
import { when } from './time'

describe('times of day', () => {
  it('are 24-hour everywhere, never AM or PM', () => {
    const now = new Date()
    now.setHours(21, 9, 0, 0)
    const unix = now.getTime() / 1000
    expect(when(unix)).toBe('21:09')
    const earlier = new Date(now)
    earlier.setDate(earlier.getDate() - 3)
    const old = earlier.getTime() / 1000
    expect(when(old)).toMatch(/21:09$/)
    expect(when(old)).not.toMatch(/AM|PM/i)
  })
})
