import { afterEach, describe, expect, it, vi } from 'vitest'
import * as me from '../../lib/me'
import { readView, writeView } from '../../lib/url'
import { askOf } from './open'
import { ALL_TABS, isTab, listedSections, listedTabs, movedTo, onPageWith, pageOf, sectionNamed, sectionOf, seeMoney, seeNetworks, TABS } from './sections'

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
    expect(TABS.goals).toEqual(['goals', 'funnels', 'toconvert', 'flow', 'sales', 'vsale', 'earners', 'sells', 'revmap', 'payments', 'customers', 'retention'])
  })
})

describe('Goals & sales is four pages', () => {
  it('lists Goals, Funnels, Sales and Coming back as its own entries', () => {
    vi.spyOn(me, 'isShared').mockReturnValue(false)
    expect(listedTabs('goals')).toEqual(['goals', 'funnels', 'sales', 'retention'])
  })
  it('puts every table on the page it belongs to, and leads each page with its first', () => {
    expect(pageOf('payments')).toBe('sales')
    expect(pageOf('customers')).toBe('sales')
    expect(pageOf('vsale')).toBe('sales')
    expect(pageOf('toconvert')).toBe('funnels')
    expect(pageOf('flow')).toBe('funnels')
    expect(pageOf('retention')).toBe('retention')
    expect(pageOf('goals')).toBe('goals')
    expect(onPageWith('earners')).toEqual(['sales', 'vsale', 'earners', 'sells', 'revmap', 'payments', 'customers'])
    expect(onPageWith('pages')).toEqual(['pages'])
  })
  it('keeps every table on exactly one page', () => {
    const every = ['goals', 'funnels', 'toconvert', 'flow', 'sales', 'vsale', 'earners', 'sells', 'revmap', 'payments', 'customers', 'retention'] as const
    for (const t of every) expect(onPageWith(t)).toContain(t)
    expect(new Set(every.flatMap((t) => onPageWith(t))).size).toBe(every.length)
  })
  it('opens on the goals tab by its address, with the goal it names', () => {
    expect(askOf({ xp: 'goals', xg: 'signup', xf: undefined, xs: undefined, filters: [] })).toMatchObject({ tab: 'goals', goal: 'signup' })
    expect(askOf({ xp: 'goals', xf: undefined, xs: undefined, filters: [] })?.goal).toBeUndefined()
    expect(askOf({ xp: 'overview', xg: 'signup', xf: undefined, xs: undefined, filters: [] })?.goal).toBeUndefined()
  })
  it('writes the goal in the address and reads it back, long names cut', () => {
    const view = readView(new URLSearchParams('x=goals&xg=Saw%20pricing'))
    expect(view.xg).toBe('Saw pricing')
    expect(writeView(view)).toContain('xg=Saw+pricing')
    expect(readView(new URLSearchParams('x=goals&xg=' + 'a'.repeat(300))).xg).toHaveLength(200)
    expect(readView(new URLSearchParams('x=goals')).xg).toBeUndefined()
  })
})
