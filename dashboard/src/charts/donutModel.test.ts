import { describe, expect, it } from 'vitest'
import { donutArcs } from './donutModel'

describe('donutArcs', () => {
  it('sizes each arc by its share and starts it where the one before ended', () => {
    const a = donutArcs([{ key: 'a', value: 60 }, { key: 'b', value: 40 }], 0)
    expect(a).toEqual([{ key: 'a', length: 60, offset: 0 }, { key: 'b', length: 40, offset: 60 }])
  })
  it('leaves a gap between arcs', () => {
    const a = donutArcs([{ key: 'a', value: 50 }, { key: 'b', value: 50 }], 2)
    expect(a.map((x) => x.length)).toEqual([48, 48])
  })
  it('keeps a tiny row visible and skips an empty one', () => {
    const a = donutArcs([{ key: 'a', value: 1000 }, { key: 'b', value: 1 }, { key: 'c', value: 0 }])
    expect(a.map((x) => x.key)).toEqual(['a', 'b'])
    expect(a[1].length).toBeGreaterThan(0)
  })
  it('is empty with nothing to show', () => {
    expect(donutArcs([])).toEqual([])
    expect(donutArcs([{ key: 'a', value: 0 }])).toEqual([])
  })
})
