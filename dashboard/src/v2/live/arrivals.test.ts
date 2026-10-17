import { describe, expect, it } from 'vitest'
import { arrivalsOf, arriveClass, BATCH } from './arrivals'

const keys = (n: number, from = 0) => Array.from({ length: n }, (_, i) => `k${from + i}`)

describe('arrivalsOf', () => {
  it('counts nothing as new on the first look', () => {
    expect(arrivalsOf(null, keys(5))).toEqual({ fresh: [], batch: false })
  })
  it('names the keys that were not there before', () => {
    expect(arrivalsOf(new Set(keys(3)), keys(5))).toEqual({ fresh: ['k3', 'k4'], batch: false })
  })
  it('does not call a known row new when it moves', () => {
    expect(arrivalsOf(new Set(['a', 'b']), ['b', 'a']).fresh).toEqual([])
  })
  it('batches ten or more into one entry, and nine stay single', () => {
    expect(arrivalsOf(new Set(), keys(BATCH - 1)).batch).toBe(false)
    expect(arrivalsOf(new Set(), keys(BATCH)).batch).toBe(true)
  })
})

describe('arriveClass', () => {
  it('slides a single arrival in', () => expect(arriveClass(false, false)).toBe('arriving'))
  it('enters a group together', () => expect(arriveClass(true, false)).toBe('arriving batch'))
  it('keeps only the glow under reduced motion, group or not', () => {
    expect(arriveClass(false, true)).toBe('arriving calm')
    expect(arriveClass(true, true)).toBe('arriving calm')
  })
})
