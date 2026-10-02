import { describe, expect, it } from 'vitest'
import { need } from '../../lib/need'
import { byDay, pinChart } from './pinChart'
import type { Pin } from './pins'

const point = (t: string, visitors: number, revenue = 0) => ({ t, visitors, pageviews: visitors, revenue })
const days = (vs: number[], from = 20) => vs.map((v, i) => point(`2026-09-${from + i}T00:00`, v, i === vs.length - 1 ? 4900 : 0))
const pin = (o: Partial<Pin>): Pin => ({ id: 'x', kind: 'spike', score: 1, filters: [], showDay: true, n: {}, ...o })

describe('the chart of a moment', () => {
  it('adds an hourly chart up into days', () => {
    const d = byDay([point('2026-09-20T00:00', 3), point('2026-09-20T01:00', 4), point('2026-09-21T00:00', 5)])
    expect(d.map((x) => [x.day, x.visitors])).toEqual([['2026-09-20', 7], ['2026-09-21', 5]])
  })

  it('draws a spike against the usual the server found, the day marked', () => {
    const c = need(pinChart(pin({ kind: 'spike', day: '2026-09-23', n: { visitors: 2813, factor: 17.2 } }), days([160, 150, 170, 2813, 190, 175, 165])))
    expect(c.values).toHaveLength(7)
    expect(c.values[need(c.hl)]).toBe(2813)
    expect(c.base).toBeCloseTo(2813 / 17.2, 5)
    expect(c.soft).toBe(true)
  })

  it('takes the other days\' median for a spike that did not say its usual', () => {
    const c = need(pinChart(pin({ kind: 'spike', day: '2026-09-23', n: {} }), days([100, 100, 100, 900, 100, 100, 100])))
    expect(c.base).toBe(100)
  })

  it('draws a sale as the days\' money, or nothing without any', () => {
    const c = need(pinChart(pin({ kind: 'sale', day: '2026-09-26' }), days([1, 2, 3, 4, 5, 6, 7])))
    expect(c.bars).toBe(true)
    expect(c.values.at(-1)).toBe(4900)
    expect(pinChart(pin({ kind: 'sale', day: '2026-09-23' }), days([1, 2, 3, 4]).map((p) => ({ ...p, revenue: 0 })))).toBeNull()
  })

  it('draws a drop as the rate before and after, with the earlier level dashed', () => {
    const c = need(pinChart(pin({ kind: 'drop', n: { wasRate: 0.05, rate: 0.03 } }), []))
    expect(c.values).toEqual([0.05, 0.05, 0.05, 0.05, 0.03, 0.03, 0.03])
    expect(c.base).toBe(0.05)
    expect(c.hl).toBe(4)
    expect(pinChart(pin({ kind: 'drop', n: {} }), [])).toBeNull()
  })

  it('draws a milestone as a climb that ends at the number reached, with it as the goal', () => {
    const c = need(pinChart(pin({ kind: 'milestone', n: { family: 'visitors', value: 10000 } }), days([10, 20, 30, 40, 50])))
    expect(c.values.at(-1)).toBeCloseTo(10000, 5)
    expect(c.values[0]).toBeLessThan(need(c.values.at(-1)))
    expect(c.goal).toBe(10000)
    // A country count or a first goal has no climb to draw.
    expect(pinChart(pin({ kind: 'milestone', n: { family: 'countries', value: 10 } }), days([1, 2, 3]))).toBeNull()
  })

  it('draws a source from its own last days, the moment\'s day marked when it is among them', () => {
    const own = { values: [0, 0, 0, 0, 40, 190, 82, 10], days: ['2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'] }
    const c = need(pinChart(pin({ kind: 'referrer', day: '2026-09-30' }), [], own))
    expect(c.values).toHaveLength(7)
    expect(c.values[need(c.hl)]).toBe(190)
    expect(pinChart(pin({ kind: 'referrer' }), [], { values: [1] })).toBeNull()
    expect(pinChart(pin({ kind: 'ai' }), days([1, 2, 3]))).toBeNull()
  })

  it('has nothing for a day the chart does not show', () => {
    expect(pinChart(pin({ kind: 'spike', day: '2026-01-01' }), days([1, 2, 3]))).toBeNull()
    expect(pinChart(pin({ kind: 'spike', day: '2026-09-20' }), [])).toBeNull()
  })
})
