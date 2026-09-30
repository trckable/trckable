import { describe, expect, it } from 'vitest'
import { moveOf, shareOf } from './change'

describe('a row against the period before', () => {
  it('goes up, down or stays', () => {
    expect(moveOf(120, 100)).toEqual({ dir: 'up', pct: 20 })
    expect(moveOf(50, 100)).toEqual({ dir: 'down', pct: 50 })
    expect(moveOf(100, 100)).toEqual({ dir: 'flat', pct: 0 })
    expect(moveOf(100, 99.8)).toEqual({ dir: 'flat', pct: 0 })
  })

  it('says nothing without a period before', () => {
    expect(moveOf(5, undefined)).toBeNull()
    expect(moveOf(5, 0)).toBeNull()
  })

  it('keeps a share between none and all', () => {
    expect(shareOf(25, 100)).toBe(0.25)
    expect(shareOf(150, 100)).toBe(1)
    expect(shareOf(5, 0)).toBe(0)
  })
})
