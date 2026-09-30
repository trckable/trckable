import { describe, expect, it } from 'vitest'
import { bucketLabel, everyNth, fractionScale, peakIndex, threeScale } from './timeScale'

describe('threeScale', () => {
  it('is 0, half and top, round, just above the peak', () => {
    expect(threeScale(1137)).toEqual({ max: 1500, step: 750 }) // 500 would stop short, 1,000 leaves half the chart empty
    expect(threeScale(183)).toEqual({ max: 200, step: 100 })
    expect(threeScale(40)).toEqual({ max: 50, step: 25 })
  })
  it('has room for a tiny or empty period', () => {
    expect(threeScale(0)).toEqual({ max: 2, step: 1 })
    expect(threeScale(1)).toEqual({ max: 2, step: 1 })
    expect(threeScale(3)).toEqual({ max: 4, step: 2 })
  })
  it('never cuts the peak off', () => {
    for (const v of [7, 99, 101, 999, 1001, 4999, 123456]) expect(threeScale(v).max).toBeGreaterThanOrEqual(v)
  })
})

describe('fractionScale', () => {
  it('is 0, half and top for a rate, round in percent', () => {
    expect(fractionScale(0.47)).toEqual({ max: 0.5, step: 0.25 })
    expect(fractionScale(0.0266)).toEqual({ max: 0.04, step: 0.02 })
  })
  it('never cuts the peak off, and has room for an empty period', () => {
    for (const v of [0.004, 0.03, 0.45, 0.99]) expect(fractionScale(v).max).toBeGreaterThanOrEqual(v)
    expect(fractionScale(0).max).toBeGreaterThan(0)
  })
})

describe('peakIndex', () => {
  it('finds the busiest point, the newest of equals', () => {
    expect(peakIndex([0, 92, 1137, 100])).toBe(2)
    expect(peakIndex([5, 9, 9, 1])).toBe(2)
  })
  it('is -1 when nothing happened', () => {
    expect(peakIndex([0, 0, 0])).toBe(-1)
    expect(peakIndex([])).toBe(-1)
  })
})

describe('bucketLabel', () => {
  it('says the hour, the day or the week', () => {
    expect(bucketLabel('2026-09-26T14:00', 'hour')).toBe('14:00')
    expect(bucketLabel('2026-09-27T00:00', 'hour')).toBe('Sep 27') // midnight names the day
    expect(bucketLabel('2026-09-26T00:00', 'day')).toBe('Sep 26')
    expect(bucketLabel('2026-09-26T00:00', 'day', true)).toBe('Sat, Sep 26')
  })
})

describe('everyNth', () => {
  it('divides a day by the hour, so each midnight is labelled', () => {
    expect(everyNth(5, 'hour')).toBe(6)
    expect(everyNth(7, 'hour')).toBe(12)
    expect(everyNth(5, 'day')).toBe(5)
  })
})
