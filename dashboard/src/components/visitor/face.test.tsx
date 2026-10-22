import { describe, expect, it } from 'vitest'
import { nameOf } from '../../lib/visitor'
import { faceOf } from './face'

describe('a visitor\'s face and name', () => {
  it('come only from the id: the same id is the same face and name, drawn once', () => {
    expect(faceOf('abc123')).toBe(faceOf('abc123'))
    expect(nameOf('abc123')).toBe(nameOf('abc123'))
    expect(nameOf('abc123')).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/)
  })
  it('differ between ids', () => {
    const names = new Set(Array.from({ length: 40 }, (_, i) => nameOf(`v${i}`)))
    expect(names.size).toBeGreaterThan(25)
  })
})
