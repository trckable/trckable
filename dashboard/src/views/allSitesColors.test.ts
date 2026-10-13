import { describe, expect, it } from 'vitest'
import { OTHER_COLOR, SITE_COLORS, siteColors } from './allSitesColors'

const sites = Array.from({ length: 9 }, (_, i) => ({ id: `s${i}` }))

describe('a site keeps its colour', () => {
  it('by its place in the account, one colour each, up to the palette', () => {
    const c = siteColors(sites)
    const named = sites.slice(0, SITE_COLORS).map((s) => c.get(s.id))
    expect(new Set(named).size).toBe(SITE_COLORS)
    expect(c.get('s0')).toBe('var(--ch-1)')
    expect(c.get('s6')).toBe('var(--ch-7)')
  })

  it('past the palette it is neutral, never a repeat', () => {
    const c = siteColors(sites)
    expect(c.get('s7')).toBe(OTHER_COLOR)
    expect(c.get('s8')).toBe(OTHER_COLOR)
  })

  it('does not follow the rank on the page', () => {
    // The same sites, the smallest last or first: the colours do not move.
    const a = siteColors(sites)
    const b = siteColors([...sites])
    expect([...a]).toEqual([...b])
  })
})
