import { describe, expect, it } from 'vitest'
import { countedOncePerDay } from './oncePerDay'

describe('when a count of people is counted once per day', () => {
  it('only on a site without cookies, and only over more than one day', () => {
    expect(countedOncePerDay(true, 1)).toBe(false)
    expect(countedOncePerDay(true, 2)).toBe(true)
    expect(countedOncePerDay(true, 30)).toBe(true)
  })
  it('never in cookie mode, nor when the mode is not known', () => {
    expect(countedOncePerDay(false, 30)).toBe(false)
    expect(countedOncePerDay(undefined, 30)).toBe(false)
  })
})
