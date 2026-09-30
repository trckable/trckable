import { describe, expect, it } from 'vitest'
import { PAD_L, tipLeft } from './plot'

describe('tipLeft', () => {
  it('sits to the right of the point when there is room', () => {
    expect(tipLeft(200, 900, 204)).toBe(214)
  })
  it('flips to the left near the right edge', () => {
    expect(tipLeft(800, 900, 204)).toBe(800 - 14 - 204)
  })
  it('never leaves the chart, on a phone either', () => {
    expect(tipLeft(100, 300, 188)).toBe(0)
    expect(tipLeft(290, 300, 188)).toBeGreaterThanOrEqual(0)
    expect(tipLeft(290, 300, 188) + 188).toBeLessThanOrEqual(300)
  })
})

describe('the plot box', () => {
  it('leaves room for the widest y label', () => {
    // "9,999" in 10.5px mono is about 32px, right-aligned 8px before the plot
    expect(PAD_L).toBeGreaterThanOrEqual(40)
  })
})
