import { describe, expect, it } from 'vitest'
import { columnHeight, columnPath, columnWidth, hasSales, isDense, moneyScale } from './moneyPlot'

describe('moneyScale', () => {
  it('is 0, half and top, round in the currency (14,900 cents is $149)', () => {
    expect(moneyScale([0, 14_900, 0])).toEqual({ ticks: [0, 10_000, 20_000], max: 20_000 })
    expect(moneyScale([2_900])).toEqual({ ticks: [0, 2_000, 4_000], max: 4_000 })
  })
  it('never cuts the biggest sale off, this period or the last', () => {
    for (const v of [100, 4_999, 14_900, 99_999, 1_234_567]) {
      expect(moneyScale([v]).max).toBeGreaterThanOrEqual(v)
      expect(moneyScale([1], [v]).max).toBeGreaterThanOrEqual(v)
    }
  })
  it('labels only the baseline when nothing sold', () => {
    expect(moneyScale([0, 0, 0])).toEqual({ ticks: [0], max: 1 })
    expect(moneyScale([])).toEqual({ ticks: [0], max: 1 })
  })
  it('makes room for last period when it out-sold this one', () => {
    expect(moneyScale([0, 0], [14_900]).max).toBe(20_000)
  })
})

describe('isDense', () => {
  it('is a line only when at least 80% of the days sold', () => {
    expect(isDense([1, 1, 1, 1, 0])).toBe(true)
    expect(isDense([1, 1, 1, 0, 0])).toBe(false)
    expect(isDense(Array.from({ length: 30 }, (_, i) => (i < 24 ? 5 : 0)))).toBe(true)
    expect(isDense(Array.from({ length: 30 }, (_, i) => (i < 23 ? 5 : 0)))).toBe(false)
  })
  it('keeps columns for a period with no sales, one sale, or too few days for a line', () => {
    expect(isDense([0, 0, 0, 0])).toBe(false)
    expect(isDense([0, 0, 149, 0])).toBe(false)
    expect(isDense([5, 5])).toBe(false)
    expect(isDense([])).toBe(false)
  })
})

describe('hasSales', () => {
  it('tells a period with sales from one without', () => {
    expect(hasSales([0, 0, 0])).toBe(false)
    expect(hasSales([])).toBe(false)
    expect(hasSales([0, 149, 0])).toBe(true)
  })
})

describe('columns', () => {
  it('are a slot wide at most, and chunky when there are few', () => {
    expect(columnWidth(800, 4)).toBe(26)
    expect(columnWidth(800, 30)).toBeCloseTo(16.53, 1)
    expect(columnWidth(120, 30)).toBeCloseTo(2.48)
    expect(columnWidth(800, 90)).toBeCloseTo(5.51, 1)
  })
  it('always show a sale, and stop at the top of the plot', () => {
    expect(columnHeight(1, 100_000, 96)).toBe(3)
    expect(columnHeight(50, 100, 96)).toBe(48)
    expect(columnHeight(500, 100, 96)).toBe(96)
    expect(columnHeight(5, 0, 96)).toBe(96)
  })
  it('are drawn from the baseline up with rounded tops', () => {
    expect(columnPath(50, 100, 40, 20)).toBe('M40 100V64Q40 60 44 60H56Q60 60 60 64V100Z')
    // A sliver is rounded by its own height, not a corner bigger than itself.
    expect(columnPath(50, 100, 3, 20)).toBe('M40 100V100Q40 97 43 97H57Q60 97 60 100V100Z')
  })
})
