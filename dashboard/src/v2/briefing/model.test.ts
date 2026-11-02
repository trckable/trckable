import { describe, expect, it } from 'vitest'
import { mult, sourceName, unitOf } from './model'

describe('periods and multiples', () => {
  it('names the kind of period', () => {
    expect([unitOf('today'), unitOf('7d'), unitOf('30d'), unitOf('custom')]).toEqual(['today', 'week', 'month', 'range'])
  })
  it('writes a multiple the way the walkthrough does, and never a huge one', () => {
    expect([mult(21.4), mult(2.43), mult(5), mult(1.04)]).toEqual(['21×', '2.4×', '5×', '1×'])
    expect(mult(5000)).toBe('100×')
  })
  it('names the places people know by name', () => {
    expect(sourceName('news.ycombinator.com')).toBe('Hacker News')
    expect(sourceName('www.example.org')).toBe('example.org')
  })
})
