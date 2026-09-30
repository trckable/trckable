import { describe, expect, it } from 'vitest'
import { pointOn, smooth } from './smooth'

// A quiet day between two busy ones dips; it does not swing below the data.
// Sampled along the very curve the chart draws (pointOn is its own formula).
function worstOvershoot(ys: number[]): number {
  const pts = ys.map((v, i) => [i * 30, 200 - v / 3])
  let worst = 0
  for (let s = 0; s <= (ys.length - 1) * 25; s++) {
    const pos = s / 25
    const [, y] = pointOn(pts, pos)
    const i = Math.min(ys.length - 2, Math.floor(pos))
    const lo = Math.min(pts[i][1], pts[i + 1][1])
    const hi = Math.max(pts[i][1], pts[i + 1][1])
    worst = Math.max(worst, lo - y, y - hi)
  }
  return worst
}

const rand = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646

describe('the curve', () => {
  it('never leaves the values of the two points it runs between, sparse revenue included', () => {
    const r = rand(7)
    for (let t = 0; t < 200; t++) {
      const ys = Array.from({ length: 30 }, () => (r() < 0.4 ? 0 : Math.round(r() * 600)))
      expect(worstOvershoot(ys)).toBeLessThan(0.01)
    }
  })
  it('stays on or above zero for data that is never below it', () => {
    const ys = [0, 149, 0, 0, 298, 49, 0, 0, 0, 99, 0]
    expect(worstOvershoot(ys)).toBeLessThan(0.01)
    // As drawn: every control point of every segment lies between its two ends.
    const pts = ys.map((v, i) => [i * 30, 200 - v / 3])
    const nums = (smooth(pts).match(/C([^C]+)/g) ?? []).map((c) => c.slice(1).trim().split(/[ ]+/).map(Number))
    expect(nums).toHaveLength(ys.length - 1)
    nums.forEach(([, c1y, , c2y, , y1], i) => {
      const y0 = pts[i][1]
      const lo = Math.min(y0, y1) - 0.1
      const hi = Math.max(y0, y1) + 0.1
      expect(c1y).toBeGreaterThanOrEqual(lo)
      expect(c1y).toBeLessThanOrEqual(hi)
      expect(c2y).toBeGreaterThanOrEqual(lo)
      expect(c2y).toBeLessThanOrEqual(hi)
    })
  })
})
