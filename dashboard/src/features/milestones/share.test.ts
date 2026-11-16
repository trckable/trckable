import { describe, expect, it } from 'vitest'
import { withLang } from './share'

describe('withLang', () => {
  it('leaves English links bare', () => {
    expect(withLang('https://trckable.com/m/abc', 'en')).toBe('https://trckable.com/m/abc')
  })
  it('adds the sharer language', () => {
    expect(withLang('https://trckable.com/m/abc', 'de')).toBe('https://trckable.com/m/abc?lang=de')
    expect(withLang('/m/abc?x=1', 'nl')).toBe('/m/abc?x=1&lang=nl')
  })
})
