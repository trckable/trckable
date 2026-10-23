import { describe, expect, it } from 'vitest'
import { dotsFit, roomFor } from './dots'

describe('the dot strip', () => {
  it('stays one dot per person while the people fit one line', () => {
    expect(dotsFit(20, 8, 400)).toEqual({ n: 20, per: 1, grey: 8 })
  })
  it('puts more people on a dot until the dots fit one line, at any width', () => {
    for (const width of [120, 200, 320, 560, 1200]) {
      for (const now of [3, 60, 232, 1400, 50000]) {
        const f = dotsFit(now, now / 3, width)
        expect(f.n).toBeLessThanOrEqual(roomFor(width))
        expect(f.n).toBeGreaterThanOrEqual(1)
        expect(f.grey).toBeLessThanOrEqual(f.n)
        expect(f.n * f.per).toBeGreaterThanOrEqual(now - f.per)
      }
    }
  })
  it('names a dot by the people it stands for', () => {
    expect(dotsFit(232, 100, 300).per).toBe(Math.ceil(232 / roomFor(300)))
  })
})
