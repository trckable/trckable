import { describe, expect, it } from 'vitest'
import type { Point, Result } from '../../lib/api'
import { glanceOf } from './glanceFacts'

const pt = (day: number, visitors: number): Point => ({ t: `2026-10-0${day}T00:00`, visitors, pageviews: visitors })
const res = (v: number[], dims: Result['dims'] = {}): Result =>
  ({ approximate: false, kpis: { visitors: v.reduce((a, b) => a + b, 0) }, series: v.map((n, i) => pt(i + 1, n)), dims, goals: null }) as unknown as Result

describe('glanceOf', () => {
  it('finds the busiest day and the top source and country with their share', () => {
    const g = glanceOf(res([2, 6, 2], { channel: [{ value: 'search', visitors: 5 }], country: [{ value: 'AL', visitors: 2 }] }), res([1, 2, 3]))
    expect(g?.peak).toEqual({ t: '2026-10-02T00:00', visitors: 6 })
    expect(g?.source).toEqual({ value: 'search', share: 0.5 })
    expect(g?.country?.share).toBe(0.2)
    expect(g?.was).toEqual([1, 2, 3])
  })

  it('has no ghost without a previous period with visitors', () => {
    expect(glanceOf(res([1, 2]))?.was).toBeUndefined()
    expect(glanceOf(res([1, 2]), res([0, 0]))?.was).toBeUndefined()
  })

  it('has nothing to show without data', () => {
    expect(glanceOf(res([0, 0]))).toBeUndefined()
    expect(glanceOf(res([4]))).toBeUndefined()
  })
})
