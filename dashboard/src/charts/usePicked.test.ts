import { describe, expect, it } from 'vitest'
import { pickedGone } from './usePicked'

describe('a picked bucket', () => {
  it('stays while it is there', () => {
    expect(pickedGone(4, 30)).toBe(false)
    expect(pickedGone(29, 30)).toBe(false)
  })
  it('is let go of when the period has fewer buckets now', () => {
    expect(pickedGone(30, 30)).toBe(true)
    expect(pickedGone(80, 7)).toBe(true)
    expect(pickedGone(0, 0)).toBe(true)
  })
  it('is let go of while Replay plays', () => {
    expect(pickedGone(2, 30, true)).toBe(true)
  })
  it('is nothing when nothing was picked', () => {
    expect(pickedGone(null, 0)).toBe(false)
    expect(pickedGone(null, 30, true)).toBe(false)
  })
})
