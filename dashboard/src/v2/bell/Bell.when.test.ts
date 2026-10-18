import { describe, expect, it } from 'vitest'
import { when } from './Bell'

// 18 Oct 2026, 07:10 UTC is 09:10 in Tirane (UTC+2) and 03:10 in New York (UTC-4).
const at = Date.UTC(2026, 9, 18, 7, 10) / 1000

describe('when', () => {
  it('shows the clock of the viewer\'s zone, not UTC', () => {
    expect(when(at, at + 60, 'Europe/Tirane')).toBe('09:10')
    expect(when(at, at + 60, 'America/New_York')).toBe('03:10')
  })

  it('is the same on every load', () => {
    expect(when(at, at + 60, 'Europe/Tirane')).toBe(when(at, at + 3600, 'Europe/Tirane'))
  })

  it('names the day once it is not the viewer\'s today', () => {
    expect(when(at, at + 86400, 'Europe/Tirane')).toBe('Sun 18 Oct 09:10')
  })

  it('counts today in the viewer\'s zone: 23:30 UTC the day before is already today in Tirane', () => {
    const late = Date.UTC(2026, 9, 17, 23, 30) / 1000
    expect(when(late, at, 'Europe/Tirane')).toBe('01:30')
    expect(when(late, at, 'UTC')).toBe('Sat 17 Oct 23:30')
  })
})
