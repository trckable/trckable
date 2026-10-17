import { describe, expect, it } from 'vitest'
import { sinceOf } from './since'

const base = { sales: 0, downSec: 0, calm: false, people: 75 }

describe('since this morning', () => {
  it('says nothing before half past nine', () => {
    expect(sinceOf({ ...base, nowMin: 9 * 60 + 29 })).toBeNull()
  })
  it('waits for the count of people, and never makes one up from the hours', () => {
    expect(sinceOf({ ...base, nowMin: 12 * 60, people: null })).toBeNull()
  })
  it('says the people the server counted since nine, and names the hour until it is two hours old', () => {
    const early = sinceOf({ ...base, nowMin: 10 * 60 })
    expect(early?.people).toBe(75)
    expect(early?.morning).toBe(false)
    expect(sinceOf({ ...base, nowMin: 11 * 60 })?.morning).toBe(true)
  })
  it('is quiet only when nothing sold, nothing went down and nothing needs a look', () => {
    expect(sinceOf({ ...base, nowMin: 12 * 60, calm: true })?.quiet).toBe(true)
    expect(sinceOf({ ...base, nowMin: 12 * 60, sales: 1, calm: true })?.quiet).toBe(false)
    expect(sinceOf({ ...base, nowMin: 12 * 60, downSec: 600, calm: true })?.down).toBe(10)
  })
})
