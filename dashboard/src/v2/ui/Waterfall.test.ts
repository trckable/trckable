import { describe, expect, it } from 'vitest'
import { waterfall } from './Waterfall'

describe('the waterfall', () => {
  it('ends on the sum of its steps, up and down', () => {
    const w = waterfall(100, [{ diff: 50 }, { diff: -30 }])
    expect(w.end).toBe(120)
    expect(w.bars).toEqual([{ lo: 100, hi: 150 }, { lo: 120, hi: 150 }])
    expect(w.top).toBe(150)
  })
})
