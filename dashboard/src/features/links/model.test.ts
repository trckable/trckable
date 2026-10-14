import { describe, expect, it } from 'vitest'
import { barPct, filterOf, sampleLink, sinceLast } from './model'

describe('barPct', () => {
  it('is the share of the busiest row, with a floor so a small one still shows', () => {
    expect(barPct(50, 100)).toBe(50)
    expect(barPct(100, 100)).toBe(100)
    expect(barPct(1, 1000)).toBe(3)
    expect(barPct(0, 100)).toBe(0)
    expect(barPct(5, 0)).toBe(0)
  })
})

describe('filterOf', () => {
  it('names the dimension and value the row was found by', () => {
    expect(filterOf({ dim: 'referrer', value: 'trustmrr.com' })).toEqual({ dim: 'referrer', value: 'trustmrr.com' })
    expect(filterOf({ dim: 'source', value: 'newsletter' })).toEqual({ dim: 'source', value: 'newsletter' })
  })
})

describe('sinceLast', () => {
  it('says now for a moment ago and counts hours and days beyond', () => {
    expect(sinceLast(1000, 1010)).toMatch(/now/i)
    expect(sinceLast(1000, 1000 + 2 * 3600)).toMatch(/2/)
    expect(sinceLast(1000, 1000 + 3 * 86400)).toMatch(/3/)
  })
})

describe('sampleLink', () => {
  it('is the site with a tag', () => {
    expect(sampleLink('example.com')).toBe('example.com/?ref=newsletter')
  })
})
