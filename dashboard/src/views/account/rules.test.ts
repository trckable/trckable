import { describe, expect, it } from 'vitest'
import { roleLock, siteChips } from './rules'

const owner = { email: 'a@x.com', role: 'owner' }
const viewer = { email: 'b@x.com', role: 'viewer' }

describe('the role control', () => {
  it('is off on yourself', () => {
    expect(roleLock(owner, 'a@x.com', 2)).toBe('self')
    expect(roleLock(viewer, 'b@x.com', 1)).toBe('self')
  })
  it('is off on the last owner', () => expect(roleLock(owner, 'z@x.com', 1)).toBe('last'))
  it('is on for another owner while there are two', () => expect(roleLock(owner, 'z@x.com', 2)).toBeNull())
  it('is on for a viewer', () => expect(roleLock(viewer, 'a@x.com', 1)).toBeNull())
})

const sites = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, domain: `${id}.com`, name: id.toUpperCase() }))

describe('the sites chips on a viewer row', () => {
  it('says all sites for no limit', () => expect(siteChips(null, sites)).toEqual({ all: true, none: false, names: [], more: 0 }))
  it('says none for an empty list', () => expect(siteChips([], sites).none).toBe(true))
  it('lists up to three names', () => expect(siteChips(['b', 'a'], sites)).toEqual({ all: false, none: false, names: ['A', 'B'], more: 0 }))
  it('counts the rest after three', () => expect(siteChips(['a', 'b', 'c', 'd', 'e'], sites)).toEqual({ all: false, none: false, names: ['A', 'B', 'C'], more: 2 }))
  it('leaves out sites that are gone', () => expect(siteChips(['a', 'gone'], sites).names).toEqual(['A']))
  it('falls back to the domain when a site has no name', () => expect(siteChips(['a'], [{ id: 'a', domain: 'a.com', name: '' }]).names).toEqual(['a.com']))
})
