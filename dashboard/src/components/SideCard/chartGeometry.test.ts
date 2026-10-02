import { describe, expect, it } from 'vitest'
import { need } from '../../lib/need'
import { CHART_H, CHART_W, geometry } from './chartGeometry'

describe('the small chart of a moment', () => {
  it('draws a line across the card, the moment as a dot on it, and the area under it', () => {
    const g = geometry({ values: [1, 2, 4, 3], hl: 2 })
    expect(g?.line.startsWith('M0 ')).toBe(true)
    expect(g?.line.endsWith(` ${g?.point?.[1]}`) || g?.line.includes(`${g?.point?.[0]} ${g?.point?.[1]}`)).toBe(true)
    expect(g?.point?.[0]).toBeCloseTo((CHART_W * 2) / 3, 0)
    expect(g?.area.endsWith(`L${CHART_W} ${CHART_H} L0 ${CHART_H}Z`)).toBe(true)
  })

  it('keeps every point inside the box, the biggest near the top and the smallest near the bottom', () => {
    const g = need(geometry({ values: [5, 0, 10, 5] }))
    const ys = [...g.line.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map((m) => +m[2])
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(CHART_H)
    }
    expect(ys[2]).toBeLessThan(ys[0])
    expect(ys[1]).toBeGreaterThan(ys[0])
  })

  it('draws the usual and the goal as levels, and fits them into the picture', () => {
    const g = need(geometry({ values: [160, 150, 2813, 190], base: 164, hl: 2, soft: true }))
    expect(g.base).toBeGreaterThan(need(g.point)[1])
    // A spike does not flatten what is usual to the floor: the square root keeps it off the bottom.
    expect(g.base).toBeLessThan(CHART_H - 6)
    const climb = need(geometry({ values: [2, 5, 10], goal: 10 }))
    expect(climb.goal).toBeLessThanOrEqual(climb.point?.[1] ?? need(climb.goal))
  })

  it('draws money as bars, an empty day as a thin grey line', () => {
    const g = need(geometry({ values: [0, 0, 49, 0], bars: true }))
    expect(g.bars).toHaveLength(4)
    expect(g.bars?.map((b) => b.empty)).toEqual([true, true, false, true])
    expect(need(g.bars)[2].h).toBeGreaterThan(need(g.bars)[0].h)
    expect(need(g.bars)[0].h).toBe(2)
    // The first and the last bars are inside the edges.
    expect(need(g.bars)[0].x).toBeGreaterThanOrEqual(0)
    expect(need(g.bars)[3].x + need(g.bars)[3].w).toBeLessThanOrEqual(CHART_W)
  })

  it('has nothing to draw for fewer than two values', () => {
    expect(geometry({ values: [] })).toBeNull()
    expect(geometry({ values: [3] })).toBeNull()
    expect(geometry({ values: [Number.NaN, Number.NaN] })).toBeNull()
  })
})
