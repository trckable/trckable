import { describe, expect, it } from 'vitest'
import { anchorOf, flowLayout, heatLevel, nearestIndex, niceScale, stack, stackPeak, tickIndexes } from './scale'

describe('niceScale', () => {
  it('rounds the top up to a round step with at most four lines', () => {
    expect(niceScale(183)).toEqual({ max: 200, step: 50, ticks: [0, 50, 100, 150, 200] })
    expect(niceScale(23).max).toBe(30) // steps of 10: 25 would need five lines
  })
  it('still draws an axis for nothing at all', () => {
    const s = niceScale(0)
    expect(s.max).toBeGreaterThan(0)
    expect(s.ticks[0]).toBe(0)
  })
})

describe('stack', () => {
  it('puts each band on the ones before it', () => {
    const [a, b] = stack([
      [1, 2],
      [3, 4],
    ])
    expect(a).toEqual({ y0: [0, 0], y1: [1, 2] })
    expect(b).toEqual({ y0: [1, 2], y1: [4, 6] })
    expect(stackPeak([[1, 2], [3, 4]])).toBe(6)
  })
})

describe('heatLevel', () => {
  it('keeps zero empty, a quiet hour visible and the peak at the top', () => {
    expect(heatLevel(0, 100)).toBe(0)
    expect(heatLevel(1, 100)).toBe(1)
    expect(heatLevel(100, 100)).toBe(4)
    expect(heatLevel(25, 100)).toBe(2) // square root: a quarter of the peak is half way
  })
})

describe('axis helpers', () => {
  it('finds the nearest bucket and clamps at the edges', () => {
    expect(nearestIndex(0, 100, 11)).toBe(0)
    expect(nearestIndex(51, 100, 11)).toBe(5)
    expect(nearestIndex(500, 100, 11)).toBe(10)
    expect(nearestIndex(-5, 100, 11)).toBe(0)
  })
  it('labels the ends and a few evenly spaced buckets', () => {
    expect(tickIndexes(30)).toEqual([0, 10, 19, 29])
    expect(tickIndexes(3)).toEqual([0, 1, 2])
    expect([anchorOf(0, 5), anchorOf(2, 5), anchorOf(4, 5)]).toEqual(['start', 'middle', 'end'])
  })
})

describe('flowLayout', () => {
  it('scales every column to the first and stacks the bands inside each box', () => {
    const { boxes, bands } = flowLayout(
      [
        [{ key: '/', value: 4 }],
        [
          { key: '/pricing', value: 3 },
          { key: '(exit)', value: 1 },
        ],
      ],
      [
        { col: 0, from: '/', to: '/pricing', value: 3 },
        { col: 0, from: '/', to: '(exit)', value: 1 },
      ],
      106,
      6,
    )
    expect(boxes.find((b) => b.key === '/')?.h).toBe(100) // 106 minus one gap, for four visits
    expect(boxes.find((b) => b.key === '(exit)')?.y).toBe(81) // 75 + the gap
    expect(bands[0]).toMatchObject({ y0: 0, h0: 75, y1: 0, h1: 75 })
    expect(bands[1]).toMatchObject({ y0: 75, h0: 25, y1: 81, h1: 25 })
  })
  it('skips a link whose box is not drawn', () => {
    const { bands } = flowLayout([[{ key: '/', value: 1 }], []], [{ col: 0, from: '/', to: '/gone', value: 1 }], 50)
    expect(bands).toEqual([])
  })
})
