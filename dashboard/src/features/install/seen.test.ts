// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { markSeen, wasSeen } from './seen'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('what a side card has already said', () => {
  it('is per card and per site, and stays put away', () => {
    expect(wasSeen('import', 'tkb_a')).toBe(false)
    markSeen('import', 'tkb_a')
    expect(wasSeen('import', 'tkb_a')).toBe(true)
    expect(wasSeen('import', 'tkb_b')).toBe(false)
    expect(wasSeen('weekly', 'tkb_a')).toBe(false)
  })

  it('never throws when the browser will not store it', () => {
    const deny = () => {
      throw new Error('denied')
    }
    vi.stubGlobal('localStorage', { getItem: deny, setItem: deny })
    expect(() => markSeen('import', 'tkb_a')).not.toThrow()
    expect(wasSeen('import', 'tkb_a')).toBe(false)
  })
})
