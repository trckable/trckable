import { describe, expect, it } from 'vitest'
import type { SlowBandReport, SlowCostReport } from '../../../lib/api'
import { mapSlowCost, roughly } from './slowCost'

const band = (b: SlowBandReport['band'], visits: number, o: Partial<SlowBandReport> = {}): SlowBandReport => ({ band: b, visits, goals: 0, engaged: 0, paid: 0, revenue: 0, orders: 0, ...o })
const report = (bands: SlowBandReport[], o: Partial<SlowCostReport> = {}): SlowCostReport => ({ bands, money: false, days: 30, ...o })

describe('mapSlowCost', () => {
  it('prices the loss with the average order, per month, and says where most of it is', () => {
    const m = mapSlowCost(
      report(
        [band('slow', 1000, { paid: 10, revenue: 50000, orders: 10 }), band('mid', 1000, { paid: 20, revenue: 100000, orders: 20 }), band('fast', 2000, { paid: 100, revenue: 500000, orders: 100 })],
        { money: true, exponent: 2, days: 30 },
      ),
    )
    // Average order 5000. Fast converts 5%; slow 1% -> 1000 x 4% x 5000 = 200000; mid 2% -> 1000 x 3% x 5000 = 150000.
    expect(m).toMatchObject({ kind: 'money', verdict: 'loss', lost: 350000, mostSlow: true })
    expect(m?.rows.map((r) => r.lost)).toEqual([200000, 150000, 0])
    expect(m?.rows[2].rate).toBe(0.05)
  })

  it('prices a paying visit by its revenue, not by the payments it made', () => {
    // Fast: 100 paying visits that made 300 payments for 600000: 6000 a paying visit.
    const m = mapSlowCost(report([band('slow', 1000, { paid: 10, revenue: 60000, orders: 30 }), band('mid', 0), band('fast', 1000, { paid: 100, revenue: 600000, orders: 300 })], { money: true, exponent: 2 }))
    // 1000 x (10% - 1%) x (660000 / 110) = 540000
    expect(m?.lost).toBe(540000)
  })

  it('does not price in money when no revenue stands behind the sales', () => {
    const m = mapSlowCost(report([band('slow', 100, { paid: 1, goals: 1 }), band('mid', 0), band('fast', 100, { paid: 30, goals: 30 })], { money: true }))
    expect(m?.kind).toBe('goals')
  })

  it('tells the month of a shorter period', () => {
    const r = report([band('slow', 100, { goals: 1 }), band('mid', 100, { goals: 5 }), band('fast', 400, { goals: 100 })], { days: 7 })
    // Slow loses 100 x (25% - 1%) = 24 in 7 days -> 103 in 30 (rounded to two figures); mid 100 x 20% = 20 -> 86.
    const m = mapSlowCost(r)
    expect(m).toMatchObject({ kind: 'goals', verdict: 'loss' })
    expect(m?.rows[0].lost).toBe(100)
    expect(m?.rows[1].lost).toBe(86)
  })

  it('counts goals, then engaged visits, when there are no sales', () => {
    const goals = mapSlowCost(report([band('slow', 100, { goals: 2 }), band('mid', 100), band('fast', 100, { goals: 30 })]))
    expect(goals?.kind).toBe('goals')
    const engaged = mapSlowCost(report([band('slow', 100, { engaged: 20 }), band('mid', 100), band('fast', 100, { engaged: 60 })]))
    expect(engaged?.kind).toBe('engaged')
    expect(engaged?.lost).toBe(100) // slow 40 + mid 60
    // Payments connected but no sale yet: the goals speak.
    const none = mapSlowCost(report([band('slow', 100, { goals: 2 }), band('mid', 100), band('fast', 100, { goals: 30 })], { money: true }))
    expect(none?.kind).toBe('goals')
  })

  it('claims nothing when the fast band is not better', () => {
    const m = mapSlowCost(report([band('slow', 200, { goals: 30 }), band('mid', 200, { goals: 20 }), band('fast', 200, { goals: 20 })]))
    expect(m).toMatchObject({ verdict: 'few', lost: 0 })
  })

  it('claims nothing from too few visits, or a difference that may be luck', () => {
    expect(mapSlowCost(report([band('slow', 200, { goals: 2 }), band('mid', 10), band('fast', 29, { goals: 20 })]))?.verdict).toBe('few')
    expect(mapSlowCost(report([band('slow', 40, { goals: 3 }), band('mid', 0), band('fast', 40, { goals: 5 })]))?.verdict).toBe('few')
  })

  it('leaves a band with too few visits without a rate or a loss', () => {
    const m = mapSlowCost(report([band('slow', 10, { goals: 0 }), band('mid', 100, { goals: 2 }), band('fast', 100, { goals: 30 })]))
    expect(m?.rows[0]).toMatchObject({ rate: null, lost: 0 })
    expect(m?.rows[1].lost).toBeGreaterThan(0)
  })

  it('is absent without a measured visit', () => {
    expect(mapSlowCost(null)).toBeNull()
    expect(mapSlowCost(report([band('slow', 0), band('mid', 0), band('fast', 0)]))).toBeNull()
  })

  it('says nothing under a whole currency unit', () => {
    const m = mapSlowCost(report([band('slow', 100, { paid: 1, revenue: 1, orders: 1 }), band('mid', 0), band('fast', 100, { paid: 40, revenue: 40, orders: 40 })], { money: true, exponent: 2 }))
    expect(m?.verdict).toBe('few')
  })

  it('keeps the pages a band tap filters to', () => {
    const m = mapSlowCost(report([band('slow', 100, { goals: 1, pages: ['/a'] }), band('mid', 0), band('fast', 100, { goals: 30 })]))
    expect(m?.rows[0].pages).toEqual(['/a'])
    expect(m?.rows[2].pages).toEqual([])
  })
})

describe('roughly', () => {
  it('keeps two figures', () => {
    expect([4, 38, 123, 1234, 56789].map(roughly)).toEqual([4, 38, 120, 1200, 57000])
  })
})
