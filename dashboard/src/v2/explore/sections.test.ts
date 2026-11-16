import { afterEach, describe, expect, it, vi } from 'vitest'
import * as me from '../../lib/me'
import { groups, isTab, sectionOf, seeMoney, seeNetworks, TABS } from './sections'

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

describe('a shared link and payments', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    seeMoney(true)
  })
  const sections = () => groups().flatMap((g) => g.items)

  it('drops Sales, and the table of sources that pay, when the report carries no payments', () => {
    vi.spyOn(me, 'isShared').mockReturnValue(true)
    seeMoney(false)
    expect(sections()).not.toContain('sales')
    expect(TABS.sources).not.toContain('earners')
    expect(isTab('sales')).toBe(false)
    expect(isTab('payments')).toBe(false)
  })
  it('keeps every other section a shared link can fill', () => {
    vi.spyOn(me, 'isShared').mockReturnValue(true)
    seeMoney(false)
    expect(sections()).toEqual(['overview', 'pages', 'sources', 'places', 'tech'])
  })
  it('shows Sales once the report carries payments', () => {
    vi.spyOn(me, 'isShared').mockReturnValue(true)
    seeMoney(true)
    expect(sections()).toContain('sales')
    expect(TABS.sources).toContain('earners')
    expect(isTab('sales')).toBe(true)
  })
  it('leaves a signed-in view as it was, payments or not', () => {
    vi.spyOn(me, 'isShared').mockReturnValue(false)
    seeMoney(false)
    expect(sections()).toContain('sales')
    expect(TABS.sales).toEqual(['sales', 'payments', 'customers'])
  })
})
