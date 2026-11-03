import { describe, expect, it } from 'vitest'
import { groups, sectionOf, seeNetworks, TABS } from './sections'

describe('the Sources section', () => {
  it('has one UTM tab, not a second pair for source and medium', () => {
    expect(TABS.sources).toContain('utm')
    expect(TABS.sources).not.toContain('utmsource')
    expect(TABS.sources).not.toContain('medium')
  })
})

describe('the Search section', () => {
  it('is its own, not a table of Sources', () => {
    expect(TABS.search).toEqual(['search'])
    expect(TABS.sources).not.toContain('search')
    expect(sectionOf('search')).toBe('search')
  })
  it('stands in the Traffic group after Sources', () => {
    expect(groups()[0].items.slice(-2)).toEqual(['sources', 'search'])
  })
})

describe('the Networks table', () => {
  it('is in Tech after Browsers, and only once a visit named a provider', () => {
    seeNetworks(false)
    expect(TABS.tech).not.toContain('networks')
    seeNetworks(true)
    expect(TABS.tech).toEqual(['devices', 'browsers', 'networks', 'bversion', 'screens'])
    expect(sectionOf('networks')).toBe('tech')
    seeNetworks(false)
  })
})
