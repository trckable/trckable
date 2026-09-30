import { describe, expect, it } from 'vitest'
import { funnelOf } from './funnelModel'

const step = (value: string, visitors: number, rate: number, dropped: number, median_s = 0) => ({ kind: 'page' as const, value, visitors, rate, of_total: 0, median_s, dropped })

describe('the funnel', () => {
  it('is no funnel with fewer than two steps', () => {
    expect(funnelOf([])).toBeNull()
    expect(funnelOf([step('/', 10, 1, 0)])).toBeNull()
  })

  it('measures each bar against the first step and writes the loss between steps', () => {
    const f = funnelOf([step('/', 1500, 1, 1402), step('/pricing', 98, 0.0653, 90, 52)])
    expect(f?.steps.map((s) => s.bar)).toEqual([1, 98 / 1500])
    expect(f?.steps[1].loss).toEqual({ pct: 93, left: 1402 })
    expect(f?.steps[0].loss).toBeNull()
    expect(f?.made).toBeCloseTo(0.0653, 3)
    expect(f?.seconds).toBe(52)
    expect(f?.exact).toBe(true)
  })

  it('adds the medians of a longer funnel, and says they are added', () => {
    const f = funnelOf([step('a', 100, 1, 50), step('b', 50, 0.5, 20, 10), step('c', 30, 0.6, 0, 20)])
    expect(f?.seconds).toBe(30)
    expect(f?.exact).toBe(false)
  })
})
