import { describe, expect, it } from 'vitest'
import { sinceOf } from './since'

const hours = (n: number, v: number) => Array.from({ length: n }, (_, i) => ({ t: `2026-10-16T${String(i).padStart(2, '0')}:00`, visitors: v, pageviews: v }))

describe('since this morning', () => {
  it('says nothing before half past nine', () => {
    expect(sinceOf({ series: hours(24, 5), nowMin: 9 * 60 + 29, sales: 0, downSec: 0, calm: false })).toBeNull()
  })
  it('counts the people after nine, and names the hour until it is two hours old', () => {
    const early = sinceOf({ series: hours(24, 5), nowMin: 10 * 60, sales: 0, downSec: 0, calm: false })
    expect(early?.people).toBe(75)
    expect(early?.morning).toBe(false)
    expect(sinceOf({ series: hours(24, 5), nowMin: 11 * 60, sales: 0, downSec: 0, calm: false })?.morning).toBe(true)
  })
  it('is quiet only when nothing sold, nothing went down and nothing needs a look', () => {
    expect(sinceOf({ series: hours(24, 1), nowMin: 12 * 60, sales: 0, downSec: 0, calm: true })?.quiet).toBe(true)
    expect(sinceOf({ series: hours(24, 1), nowMin: 12 * 60, sales: 1, downSec: 0, calm: true })?.quiet).toBe(false)
    expect(sinceOf({ series: hours(24, 1), nowMin: 12 * 60, sales: 0, downSec: 600, calm: true })?.down).toBe(10)
  })
})
