import { describe, expect, it } from 'vitest'
import { placeTip } from './plot'

describe('placeTip', () => {
  it('sits right of the mark at the left edge', () => {
    expect(placeTip(0, 40, 100, 40, 300, 120)).toEqual({ left: 12, top: 28 })
  })
  it('flips left of the mark at the right edge', () => {
    expect(placeTip(300, 40, 100, 40, 300, 120)).toEqual({ left: 188, top: 28 })
  })
  it('stays inside a narrow box just past the middle', () => {
    const p = placeTip(160, 40, 150, 40, 300, 120)
    expect(p.left).toBeGreaterThanOrEqual(0)
    expect(p.left + 150).toBeLessThanOrEqual(300)
  })
  it('goes above the mark, never over it, when neither side has room', () => {
    const p = placeTip(100, 80, 180, 40, 200, 120)
    expect(p.left).toBe(10)
    expect(p.top + 40).toBeLessThanOrEqual(80 - 12)
  })
  it('stays inside at the top', () => {
    expect(placeTip(50, 4, 100, 40, 300, 120).top).toBe(0)
  })
  it('keeps the bottom inside', () => {
    expect(placeTip(50, 118, 100, 40, 300, 120).top).toBe(80)
  })
})
