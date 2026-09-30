import { describe, expect, it } from 'vitest'
import { retentionOf, shade } from './retentionModel'

const cohorts = {
  weeks: ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21'],
  size: [1000, 2000, 1000, 500],
  back: [[1000, 100, 50, 30], [2000, 160, 40], [1000, 30], [500]],
}

describe('retention', () => {
  it('has nothing to say without cohorts', () => {
    expect(retentionOf(null)).toEqual({ kind: 'none' })
    expect(retentionOf({ weeks: [], size: [], back: [] })).toEqual({ kind: 'none' })
  })

  it('draws weeks after the first, with unfinished cells left open', () => {
    const r = retentionOf(cohorts)
    if (r.kind !== 'table') throw new Error('a table')
    expect(r.cols).toBe(3)
    expect(r.cells[0].map((c) => c.state)).toEqual(['done', 'done', 'done'])
    expect(r.cells[1].map((c) => c.state)).toEqual(['done', 'done', 'open'])
    expect(r.cells[3].map((c) => c.state)).toEqual(['open', 'open', 'open'])
    expect(r.cells[0][0]).toEqual({ state: 'done', share: 0.1, back: 100 })
  })

  it('averages a week over the cohorts that finished it, by their size', () => {
    const r = retentionOf(cohorts)
    if (r.kind !== 'table') throw new Error('a table')
    expect(r.curve[0]).toBeCloseTo(290 / 4000, 6) // week 1: three cohorts
    expect(r.curve[1]).toBeCloseTo(90 / 3000, 6) // week 2: two
    expect(r.curve[2]).toBeCloseTo(30 / 1000, 6)
    expect(r.top).toBeCloseTo(0.1, 6)
  })

  it('gives under two whole weeks one line, and no table', () => {
    expect(retentionOf({ weeks: ['2026-09-07'], size: [400], back: [[400, 36]] })).toEqual({ kind: 'line', nextWeek: 0.09 })
    expect(retentionOf({ weeks: ['2026-09-07'], size: [400], back: [[400]] })).toEqual({ kind: 'none' })
  })

  it('caps the weeks a long history draws', () => {
    const long = { weeks: Array.from({ length: 14 }, (_, i) => `w${i}`), size: Array<number>(14).fill(10), back: Array.from({ length: 14 }, (_, i) => Array<number>(14 - i).fill(5)) }
    const r = retentionOf(long)
    if (r.kind !== 'table') throw new Error('a table')
    expect(r.cols).toBe(8)
  })

  it('shades on one ramp, the top share darkest', () => {
    expect(shade(0, 0.1)).toBe(6)
    expect(shade(0.1, 0.1)).toBe(38)
    expect(shade(0.05, 0.1)).toBe(22)
    expect(shade(0.5, 0)).toBe(0)
  })
})
