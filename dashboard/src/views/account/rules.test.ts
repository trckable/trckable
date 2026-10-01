import { describe, expect, it } from 'vitest'
import { findSites, orderPeople, roleLock, sitesSummary, toggledSites } from './rules'

const owner = { email: 'a@x.com', role: 'owner' }
const viewer = { email: 'b@x.com', role: 'viewer' }

describe('the role control', () => {
  it('is off on yourself', () => {
    expect(roleLock(owner, 'a@x.com', 2)).toBe('self')
    expect(roleLock(viewer, 'b@x.com', 1)).toBe('self')
  })
  it('is off on the last owner', () => expect(roleLock(owner, 'z@x.com', 1)).toBe('last'))
  it('says last, not self, when you are the last owner', () => expect(roleLock(owner, 'a@x.com', 1)).toBe('last'))
  it('is off on the first owner, even beside another owner', () => {
    expect(roleLock({ ...owner, holder: true }, 'z@x.com', 2)).toBe('holder')
    expect(roleLock({ ...owner, holder: true }, 'a@x.com', 2)).toBe('holder')
  })
  it('is on for another owner while there are two', () => expect(roleLock(owner, 'z@x.com', 2)).toBeNull())
  it('is on for a viewer', () => expect(roleLock(viewer, 'a@x.com', 1)).toBeNull())
})

const sites = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, domain: `${id}.com`, name: id.toUpperCase() }))

describe('the sites on a person row', () => {
  it('is every site for no limit', () => expect(sitesSummary(null, sites)).toMatchObject({ all: true, none: false, count: 5, total: 5 }))
  it('is none for an empty list', () => expect(sitesSummary([], sites)).toMatchObject({ all: false, none: true, count: 0 }))
  it('counts the ticked ones out of all', () => expect(sitesSummary(['b', 'a'], sites)).toMatchObject({ all: false, count: 2, total: 5 }))
  it('shows up to three marks, in the list order', () => expect(sitesSummary(['a', 'b', 'c', 'd'], sites).marks.map((s) => s.id)).toEqual(['a', 'b', 'c']))
  it('leaves out sites that are gone', () => expect(sitesSummary(['a', 'gone'], sites).count).toBe(1))
})

describe('ticking a site', () => {
  it('adds it', () => expect(toggledSites(['a'], sites, 'b')).toEqual(['a', 'b']))
  it('removes it', () => expect(toggledSites(['a', 'b'], sites, 'a')).toEqual(['b']))
  it('starts from every site when there was no limit', () => expect(toggledSites(null, sites, 'c')).toEqual(['a', 'b', 'd', 'e']))
})

describe('finding a site', () => {
  it('matches the domain or the name, in any case', () => {
    expect(findSites(sites, ' C.CO ').map((s) => s.id)).toEqual(['c'])
    expect(findSites(sites, 'e').map((s) => s.id)).toEqual(['e'])
  })
  it('lists everything for an empty search', () => expect(findSites(sites, '  ')).toHaveLength(5))
})

describe('the order of the list', () => {
  const p = (email: string, role: string, last_seen: number) => ({ email, role, last_seen })
  it('is you, then owners, then viewers, the latest seen first', () => {
    const list = [p('v1@x.com', 'viewer', 9), p('o1@x.com', 'owner', 1), p('me@x.com', 'owner', 0), p('v2@x.com', 'viewer', 20), p('o2@x.com', 'owner', 5)]
    expect(orderPeople(list, 'me@x.com').map((x) => x.email)).toEqual(['me@x.com', 'o2@x.com', 'o1@x.com', 'v2@x.com', 'v1@x.com'])
  })
})
