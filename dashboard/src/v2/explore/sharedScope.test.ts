// What a shared link shows is what its owner left on: the sections off are not offered by Explore, and a period
// fixed for the link says so. (The server refuses the same data; this is the page not offering what would come back empty.)
import { afterEach, describe, expect, it } from 'vitest'
import { fixedPeriod, sectionShown, setShared, setSharedScope } from '../../lib/me'
import { isTab, listedSections, TABS } from './sections'

afterEach(() => setSharedScope())

describe('a shared link with some sections off', () => {
  it('offers the tables of the sections that are on, and those of Overview and Sales whatever the list says', () => {
    setShared()
    setSharedScope(['pages'])
    expect(TABS.pages).toContain('pages')
    expect(TABS.overview).toContain('overview')
    expect(TABS.goals).toContain('sales')
    for (const s of ['sources', 'audience'] as const) expect(TABS[s]).toEqual([])
  })
  it('lists only the sections that have a table left, and does not follow an address into one that is off', () => {
    setShared()
    setSharedScope(['pages'])
    const listed = listedSections()
    expect(listed).toContain('pages')
    for (const s of ['sources', 'audience']) expect(listed).not.toContain(s)
    expect(isTab('countries')).toBe(false)
    expect(isTab('pages')).toBe(true)
  })
  it('offers every section it can when the link lists them all, or does not say', () => {
    setShared()
    setSharedScope(['pages', 'sources', 'places', 'tech'])
    expect(TABS.audience).toContain('countries')
    setSharedScope(undefined)
    expect(TABS.audience).toContain('devices')
  })
  it('knows which sections an owner can switch off', () => {
    setShared()
    setSharedScope([])
    expect(sectionShown('pages')).toBe(false)
    expect(sectionShown('overview')).toBe(true)
    expect(sectionShown('sales')).toBe(true)
  })
})

describe('the period of a shared link', () => {
  it('is fixed when the link says so, and free otherwise', () => {
    setShared()
    expect(fixedPeriod()).toBe('')
    setSharedScope(undefined, '7d')
    expect(fixedPeriod()).toBe('7d')
  })
})
