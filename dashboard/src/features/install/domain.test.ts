import { describe, expect, it } from 'vitest'
import { checkDomain, cleanDomain, isAdded } from './domain'

describe('cleanDomain', () => {
  it.each([
    ['example.com', 'example.com'],
    ['  Example.COM  ', 'example.com'],
    ['https://www.example.com/path', 'example.com'],
    ['http://shop.example.com/a/b?x=1#y', 'shop.example.com'],
    ['https://user:pw@example.com:8443/x', 'example.com'],
    ['//www.example.com', 'example.com'],
    ['example.com.', 'example.com'],
    ['example.com?utm=1', 'example.com'],
    ['www.example.com/', 'example.com'],
  ])('%s -> %s', (input, out) => expect(cleanDomain(input)).toBe(out))
})

describe('checkDomain', () => {
  it('flags placeholders, also pasted with www', () => {
    for (const raw of ['example.com', 'www.example.org', 'https://test.com/x', 'a.example']) expect(checkDomain(cleanDomain(raw), raw)).toBe('placeholder')
  })
  const check = (raw: string) => checkDomain(cleanDomain(raw), raw)
  it('asks for something first', () => expect(check('  ')).toBe('empty'))
  it('accepts domains and pasted addresses', () => {
    for (const ok of ['mysite.com', 'https://www.mysite.com/pricing', 'a-b.example.co.uk', 'localhost', 'bücher.test'])
      expect(check(ok)).toBe('ok')
  })
  it('rejects what is not a domain', () => {
    for (const bad of ['example', '-a.com', 'a-.com', 'a..com', 'exa mple.com', '.com'])
      expect(['space', 'invalid']).toContain(check(bad))
  })
  it('names a space', () => expect(check('my site.com')).toBe('space'))
})

describe('isAdded', () => {
  it('matches without www and case', () => {
    expect(isAdded('example.com', ['www.Example.com'])).toBe(true)
    expect(isAdded('example.com', ['shop.example.com'])).toBe(false)
    expect(isAdded('', [''])).toBe(false)
  })
})
