import { describe, expect, it } from 'vitest'
import { layout } from './PageMap'

describe('the page map', () => {
  it('gives each tile the area of its value and fills the box', () => {
    const out = layout([{ key: 'a', name: 'a', v: 50 }, { key: 'b', name: 'b', v: 30 }, { key: 'c', name: 'c', v: 20 }], 0, 0, 100, 100)
    for (const t of out) expect(t.w * t.h).toBeCloseTo(t.v * 100)
    expect(out.reduce((p, t) => p + t.w * t.h, 0)).toBeCloseTo(10000)
  })
})
