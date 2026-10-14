import { describe, expect, it } from 'vitest'
import { shareOf } from './change'

describe('a row against the whole', () => {
  it('keeps a share between none and all', () => {
    expect(shareOf(25, 100)).toBe(0.25)
    expect(shareOf(150, 100)).toBe(1)
    expect(shareOf(5, 0)).toBe(0)
  })
})
