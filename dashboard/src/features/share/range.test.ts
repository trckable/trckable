import { describe, expect, it } from 'vitest'
import { openRange, rangeProblem } from './range'

const today = '2026-11-23'
const first = '2025-02-04'

describe('the days a custom period may take', () => {
  it('takes any days from the first data to today, in order', () => {
    expect(rangeProblem('2026-03-01', '2026-06-14', today, first)).toBeNull()
    expect(rangeProblem(first, today, today, first)).toBeNull()
    expect(rangeProblem('2026-05-05', '2026-05-05', today, first)).toBeNull()
    expect(rangeProblem('2020-01-01', '2020-01-02', today)).toBeNull() // first data not known: no lower bound
  })
  it('refuses a day after today', () => {
    expect(rangeProblem('2026-11-01', '2026-11-24', today, first)).toBe('future')
    expect(rangeProblem('2026-11-24', '2026-11-25', today, first)).toBe('future')
  })
  it('refuses a day before the first data', () => {
    expect(rangeProblem('2025-02-03', '2026-01-01', today, first)).toBe('early')
  })
  it('refuses a start after the end, and an empty day', () => {
    expect(rangeProblem('2026-06-14', '2026-03-01', today, first)).toBe('order')
    expect(rangeProblem('', '2026-03-01', today, first)).toBe('missing')
  })
  it('opens on the last 30 days, or since the first data when the site is younger', () => {
    expect(openRange(today, first)).toEqual({ from: '2026-10-25', to: today })
    expect(openRange(today, '2026-11-10')).toEqual({ from: '2026-11-10', to: today })
  })
})
