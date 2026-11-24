import { afterEach, describe, expect, it, vi } from 'vitest'
import { ACCENTS, DEFAULT_STYLE } from './card'
import { keepStyle, savedStyle } from './style'

const store = (initial: Record<string, string> = {}) => {
  const data = { ...initial }
  vi.stubGlobal('localStorage', { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) })
  return data
}
afterEach(() => vi.unstubAllGlobals())

describe('the style kept for a site', () => {
  it('is the default until one is kept', () => {
    store()
    expect(savedStyle('a')).toEqual(DEFAULT_STYLE)
  })
  it('comes back as it was kept, for that site only', () => {
    store()
    keepStyle('a', { style: 'ocean', accent: ACCENTS[3], name: false, date: true, chart: false })
    expect(savedStyle('a')).toEqual({ style: 'ocean', accent: ACCENTS[3], name: false, date: true, chart: false })
    expect(savedStyle('b')).toEqual(DEFAULT_STYLE)
  })
  it('puts back to the default what this build does not know', () => {
    store({ 'trckable:share-style:a': JSON.stringify({ style: 'neon', accent: '#123456', name: false }) })
    expect(savedStyle('a')).toEqual({ ...DEFAULT_STYLE, name: false })
  })
  it('never throws in a browser that will not store', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('no') }, setItem: () => { throw new Error('no') } })
    expect(savedStyle('a')).toEqual(DEFAULT_STYLE)
    expect(() => keepStyle('a', DEFAULT_STYLE)).not.toThrow()
  })
})
