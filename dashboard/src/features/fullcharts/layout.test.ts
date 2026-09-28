import { describe, expect, it } from 'vitest'
import { packRows } from './layout'

/** The rows as the grid draws them: spans in grid order. */
function rows(wants: number[], cols: number) {
  const { spans, order } = packRows(wants, cols)
  const byPlace = spans.map((s, i) => ({ s, at: order[i] })).sort((a, b) => a.at - b.at)
  const out: number[][] = []
  let row: number[] = []
  let sum = 0
  for (const { s } of byPlace) {
    row.push(s)
    sum += s
    if (sum === cols) {
      out.push(row)
      row = []
      sum = 0
    }
  }
  return { out, rest: row }
}

describe('packRows', () => {
  it('leaves full rows alone', () => {
    expect(packRows([2, 1, 1, 2, 2], 4)).toEqual({ spans: [2, 1, 1, 2, 2], order: [0, 1, 2, 3, 4] })
  })
  it('moves a narrow card up into a gap', () => {
    // Every chart: sources, funnel, convert, visitors, rhythm, map, flow.
    expect(rows([2, 1, 1, 1, 2, 1, 2], 2).out).toEqual([[2], [1, 1], [1, 1], [2], [2]])
  })
  it('widens the last card when nothing behind it fits', () => {
    expect(packRows([1, 2, 2], 2).spans).toEqual([2, 2, 2])
  })
  it('fills the last row', () => {
    expect(packRows([2, 1], 4).spans).toEqual([2, 2])
  })
  it('caps a card at the grid', () => {
    expect(packRows([4, 1], 2).spans).toEqual([2, 2])
    expect(packRows([2, 2, 1], 1).spans).toEqual([1, 1, 1])
  })
  it('never leaves a hole', () => {
    for (let n = 1; n < 10; n++) {
      const wants = Array.from({ length: n }, (_, i) => ((i * 7) % 3) + 1)
      for (const cols of [1, 2, 4]) expect(rows(wants, cols).rest, `${wants.join(',')} in ${String(cols)}`).toEqual([])
    }
  })
  it('handles nothing', () => {
    expect(packRows([], 4)).toEqual({ spans: [], order: [] })
  })
})
