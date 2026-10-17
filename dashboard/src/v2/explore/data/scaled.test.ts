import { describe, expect, it } from 'vitest'
import type { Result } from '../../../lib/api'
import { scaled } from './scaled'

const day = { kpis: { visitors: 200, sessions: 220, pageviews: 600, bounce_rate: 0.4 }, series: [], dims: { page: [{ value: '/', visitors: 100 }] }, goals: [{ value: 'signup', visitors: 10 }] } as unknown as Result

describe('scaled', () => {
  it('stands a whole day for the part of it that has happened', () => {
    const half = scaled(day, 0.5)
    expect(half.kpis.visitors).toBe(100)
    expect(half.kpis.pageviews).toBe(300)
    expect(half.dims.page?.[0].visitors).toBe(50)
    expect(half.goals?.[0].visitors).toBe(5)
    expect(half.kpis.bounce_rate).toBe(0.4)
  })
})
