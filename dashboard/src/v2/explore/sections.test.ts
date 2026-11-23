import { afterEach, describe, expect, it, vi } from 'vitest'
import * as me from '../../lib/me'
import { ALL_TABS, isTab, listedSections, movedTo, sectionNamed, sectionOf, seeMoney, seeNetworks, TABS } from './sections'

describe('the Sources section', () => {
  it('has one UTM tab, not a second pair for source and medium', () => {
    expect(TABS.sources).toContain('utm')
    expect(TABS.sources).not.toContain('utmsource')
    expect(TABS.sources).not.toContain('medium')
  })
})

describe('the sections', () => {
  it('are seven, in this order', () => {
    expect(listedSections()).toEqual(['overview', 'pages', 'sources', 'audience', 'goals', 'health', 'web'])
  })
  it('hold no table twice', () => {
    const all = listedSections().flatMap((s) => TABS[s])
    expect(new Set(all).size).toBe(all.length)
  })
  it('have no Search of their own: it is Google\'s panel in Sources', () => {
    expect(ALL_TABS).not.toContain('search')
    expect(TABS.sources).toEqual(['sources', 'utm'])
    expect(movedTo('search')).toEqual({ tab: 'sources', source: 'google' })
  })
  it('keep the old addresses and section names working', () => {
    expect(movedTo('referrers')).toEqual({ tab: 'sources' })
    expect(movedTo('quality')).toEqual({ tab: 'sources' })
    expect(movedTo('bots')).toEqual({ tab: 'ai' })
    expect(movedTo('pages')).toBeUndefined()
    const old = { search: 'sources', places: 'audience', tech: 'audience', results: 'goals', sales: 'goals', speed: 'health', mentions: 'web', links: 'web', ai: 'web', answers: 'web', pages: 'pages', overview: 'overview' }
    for (const [from, to] of Object.entries(old)) expect(sectionNamed(from)).toBe(to)
    expect(sectionNamed('nowhere')).toBeUndefined()
  })
  it('send a table that moved to the section it now sits in', () => {
    expect(sectionOf('earners')).toBe('goals')
    expect(sectionOf('sells')).toBe('goals')
    expect(sectionOf('revmap')).toBe('goals')
    expect(sectionOf('speed')).toBe('health')
    expect(sectionOf('outbound')).toBe('web')
  })
})

describe('the Networks table', () => {
  it('is in Audience after Browsers, and only once a visit named a provider', () => {
    seeNetworks(false)
    expect(TABS.audience).not.toContain('networks')
    seeNetworks(true)
    expect(TABS.audience).toEqual(['countries', 'regions', 'cities', 'timezones', 'languages', 'people', 'devices', 'browsers', 'networks', 'bversion', 'screens'])
    expect(sectionOf('networks')).toBe('audience')
    seeNetworks(false)
  })
})

describe('a shared link and payments', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    seeMoney(true)
  })
  const sections = () => listedSections()

  it('drops Sales, and the table of sources that pay, when the report carries no payments', () => {
    vi.spyOn(me, 'isShared').mockReturnValue(true)
    seeMoney(false)
    expect(sections()).not.toContain('goals')
    expect(TABS.goals).not.toContain('sales')
    expect(TABS.goals).not.toContain('earners')
    expect(isTab('sales')).toBe(false)
    expect(isTab('payments')).toBe(false)
  })
  it('keeps every other section a shared link can fill', () => {
    vi.spyOn(me, 'isShared').mockReturnValue(true)
    seeMoney(false)
    expect(sections()).toEqual(['overview', 'pages', 'sources', 'audience'])
  })
  it('shows Sales once the report carries payments', () => {
    vi.spyOn(me, 'isShared').mockReturnValue(true)
    seeMoney(true)
    expect(sections()).toContain('goals')
    expect(TABS.goals).toContain('earners')
    expect(isTab('sales')).toBe(true)
  })
  it('leaves a signed-in view as it was, payments or not', () => {
    vi.spyOn(me, 'isShared').mockReturnValue(false)
    seeMoney(false)
    expect(sections()).toContain('goals')
    expect(TABS.goals).toEqual(['funnels', 'retention', 'vsale', 'toconvert', 'flow', 'sales', 'earners', 'sells', 'revmap', 'payments', 'customers'])
  })
})
