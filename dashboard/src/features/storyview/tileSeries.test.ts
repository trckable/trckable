import { describe, expect, it } from 'vitest'
import type { Point } from '../../lib/api'
import { tileSeries } from './tileSeries'

const pt = (visitors: number, pageviews: number, o: Partial<Point> = {}): Point => ({ t: '2026-10-01T00:00', visitors, pageviews, ...o })

describe('tileSeries', () => {
  it('draws each tile from its own bucket value', () => {
    const s = tileSeries([pt(4, 8, { bounce_rate: 0.5, avg_session_s: 60 }), pt(2, 2, { bounce_rate: 1, avg_session_s: 0 })], false)
    expect(s.visitors).toEqual([4, 2])
    expect(s.bounce).toEqual([50, 100])
    expect(s.session).toEqual([60, 0])
    expect(s.revenue).toBeUndefined()
  })

  it('carries a rate over a quiet bucket instead of dropping it to zero', () => {
    const s = tileSeries([pt(0, 0), pt(3, 3, { bounce_rate: 0.4, avg_session_s: 30 }), pt(0, 0), pt(1, 2, { bounce_rate: 0.2, avg_session_s: 10 })], true)
    expect(s.bounce).toEqual([40, 40, 40, 20])
    expect(s.session).toEqual([30, 30, 30, 10])
    expect(s.revenue).toEqual([0, 0, 0, 0])
  })
})
