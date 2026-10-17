import { describe, expect, it } from 'vitest'
import { averagePosition } from './searchPosition'

const row = (clicks: number, impressions: number, position: number) => ({ key: 'q', clicks, impressions, ctr: 0, position })

describe('averagePosition', () => {
  it('weights each query by how often it was shown, not by its clicks', () => {
    expect(averagePosition([row(90, 100, 2), row(1, 900, 10)])).toBeCloseTo(9.2, 5)
  })
  it('is 0 when nothing was shown', () => {
    expect(averagePosition(null)).toBe(0)
    expect(averagePosition([])).toBe(0)
  })
})
