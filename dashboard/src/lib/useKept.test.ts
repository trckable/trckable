import { describe, expect, it } from 'vitest'
import { keep } from './useKept'

describe('keep', () => {
  it('shows the new value and holds it', () => {
    expect(keep(null, 1, 's')).toEqual({ held: { scope: 's', value: 1 }, shown: 1 })
  })

  it('holds the last value while the next one is missing', () => {
    const first = keep(null, 1, 's')
    expect(keep(first.held, null, 's').shown).toBe(1)
    expect(keep(first.held, undefined, 's').shown).toBe(1)
  })

  it('is empty before anything has arrived', () => {
    expect(keep<number>(null, null, 's').shown).toBeNull()
  })

  it('lets go of the value when the scope changes', () => {
    const first = keep(null, 1, 'a')
    const next = keep(first.held, null, 'b')
    expect(next.shown).toBeNull()
    expect(next.held).toBeNull()
  })

  it('keeps a falsy value that is really there', () => {
    expect(keep(keep(null, 5, 's').held, 0, 's').shown).toBe(0)
  })
})
