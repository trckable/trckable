import { describe, expect, it } from 'vitest'
import type { SiteRow } from '../lib/api'
import { bandsOf, OTHER_COLOR, SITE_COLORS, siteColors } from './allSitesColors'

const sites = Array.from({ length: 9 }, (_, i) => ({ id: `s${i}` }))
const row = (id: string, visitors: number, series: number[]) => ({ id, domain: `${id}.example`, name: '', visitors, series }) as unknown as SiteRow

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

describe('the stack', () => {
  const colors = siteColors(sites)

  it('puts the biggest site at the bottom and skips a site with no visits', () => {
    const bands = bandsOf([row('s0', 5, [1, 4]), row('s1', 9, [4, 5]), row('s2', 0, [0, 0])], colors, 2)
    expect(bands.map((b) => b.key)).toEqual(['s1', 's0'])
    expect(bands.map((b) => b.color)).toEqual(['var(--ch-2)', 'var(--ch-1)'])
  })

  it('folds the sites past the palette into one Other band on top, summed', () => {
    const bands = bandsOf([row('s0', 3, [1, 2]), row('s7', 10, [4, 6]), row('s8', 2, [1, 1])], colors, 2)
    expect(bands.map((b) => b.key)).toEqual(['s0', 'other'])
    expect(bands[1]).toMatchObject({ label: '', color: OTHER_COLOR, series: [5, 7], visitors: 12 })
  })

  it('has no Other band when every site has a colour', () => {
    expect(bandsOf([row('s0', 3, [1, 2])], colors, 2).some((b) => b.key === 'other')).toBe(false)
  })
})
