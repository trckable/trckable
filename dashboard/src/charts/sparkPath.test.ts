import { describe, expect, it } from 'vitest'
import { sparkPoints, SPARK_H, SPARK_W } from './sparkPath'

describe('a sparkline', () => {
  it('puts the biggest day at the top and a day with nobody at the bottom', () => {
    const pts = sparkPoints([0, 5, 10]).split(' ')
    expect(pts).toHaveLength(3)
    expect(pts[0]).toBe('1.5,16.5')
    expect(pts[2]).toBe(`${SPARK_W - 1.5},1.5`)
    expect(pts[1].split(',')[1]).toBe(((16.5 + 1.5) / 2).toFixed(1))
  })
  it('stays inside its box', () => {
    for (const p of sparkPoints([3, 9, 0, 27, 1]).split(' ')) {
      const [x, y] = p.split(',').map(Number)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(SPARK_W)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(SPARK_H)
    }
  })
  it('draws a quiet row flat along the bottom, and nothing for one day', () => {
    expect(new Set(sparkPoints([0, 0, 0, 0]).split(' ').map((p) => p.split(',')[1]))).toEqual(new Set(['16.5']))
    expect(sparkPoints([4])).toBe('')
    expect(sparkPoints([])).toBe('')
  })
})
