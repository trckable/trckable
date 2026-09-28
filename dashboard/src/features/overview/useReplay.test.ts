import { describe, expect, it } from 'vitest'
import { replayMs, replayPath, replayStart } from './useReplay'

describe('replayStart', () => {
  it('starts on the chart\'s first point, a new site\'s first visit', () => {
    expect(replayStart(5, -1, 7)).toBe(5)
    expect(replayStart(0, -1, 48)).toBe(0)
  })
  it('never starts before that first point', () => {
    expect(replayStart(5, 2, 7)).toBe(5)
  })
  it('picks up where it was paused, and starts over from the last point', () => {
    expect(replayStart(0, 20, 48)).toBe(20)
    expect(replayStart(3, 6, 7)).toBe(3)
  })
})

describe('replayMs', () => {
  it('plays a day of hours faster than a week of days', () => {
    expect(replayMs(24)).toBeLessThan(replayMs(7))
  })
})

describe('replayPath', () => {
  it('visits every point from the start', () => {
    expect(replayPath(2, 5)).toEqual([2, 3, 4])
  })
  it('with reduced motion, only the moments from the start, then the end', () => {
    expect(replayPath(2, 10, [1, 4, 7])).toEqual([2, 4, 7, 9])
    expect(replayPath(0, 5, [4])).toEqual([0, 4])
  })
})
