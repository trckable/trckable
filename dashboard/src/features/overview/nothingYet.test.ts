import { describe, expect, it } from 'vitest'
import type { KPIs } from '../../lib/api'
import { nothingYet } from './useRace'

const at = (visitors: number, pageviews: number, revenue = 0) => ({ kpis: { visitors, pageviews } as KPIs, revenue })

describe('nothingYet', () => {
  it('is true until a visit, a pageview or a sale has happened', () => {
    expect(nothingYet(at(0, 0))).toBe(true)
    expect(nothingYet(at(0.3, 0.4))).toBe(true) // a fraction that would show as 0
  })
  it('is false when nothing is racing', () => {
    expect(nothingYet(null)).toBe(false)
  })
  it('is false once any of them has', () => {
    expect(nothingYet(at(1, 0))).toBe(false)
    expect(nothingYet(at(0, 2))).toBe(false)
    expect(nothingYet(at(0, 0, 500))).toBe(false)
  })
})
