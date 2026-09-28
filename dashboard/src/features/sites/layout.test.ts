import { describe, expect, it } from 'vitest'
import type { Site } from '../../lib/api'
import { EMPTY, addGroup, flat, moveTo, pin, removeGroup, renameGroup, sectionsOf, step, stepGroup, unpin } from './layout'

const site = (id: string): Site => ({ id, domain: id + '.com', name: '', timezone: 'UTC', currency: 'EUR', proxy_key: '' })
const sites = ['a', 'b', 'c', 'd'].map(site)
const ids = (l = EMPTY) => flat(sites, l).map((s) => s.id)

describe('the site layout', () => {
  it('keeps the order sites were made in until someone arranges them', () => {
    expect(ids()).toEqual(['a', 'b', 'c', 'd'])
    expect(sectionsOf(sites, EMPTY).map((s) => s.place.kind)).toEqual(['rest'])
  })
  it('puts sites it does not know yet after the arranged ones', () => {
    expect(ids({ order: ['c', 'a'], pinned: [], groups: [] })).toEqual(['c', 'a', 'b', 'd'])
  })
  it('pins to the top and unpins back to the list', () => {
    const l = pin(sites, EMPTY, 'c')
    expect(ids(l)).toEqual(['c', 'a', 'b', 'd'])
    expect(sectionsOf(sites, l)[0]).toMatchObject({ place: { kind: 'pinned' } })
    expect(ids(unpin(sites, l, 'c'))).toEqual(['a', 'b', 'd', 'c'])
  })
  it('steps a site up and down inside its section, and stops at the ends', () => {
    expect(ids(step(sites, EMPTY, 'c', -1))).toEqual(['a', 'c', 'b', 'd'])
    expect(ids(step(sites, EMPTY, 'a', -1))).toEqual(['a', 'b', 'c', 'd'])
    expect(ids(step(sites, EMPTY, 'd', 1))).toEqual(['a', 'b', 'c', 'd'])
    const l = pin(sites, EMPTY, 'd')
    expect(ids(step(sites, l, 'a', -1))).toEqual(['d', 'a', 'b', 'c'])
  })
  it('moves a site into a group, before the one it was dropped on', () => {
    let l = addGroup(EMPTY, ' Clients ')
    expect(l.groups[0].name).toBe('Clients')
    l = moveTo(sites, l, 'b', { kind: 'group', name: 'Clients' })
    l = moveTo(sites, l, 'd', { kind: 'group', name: 'Clients' }, 'b')
    const secs = sectionsOf(sites, l)
    expect(secs.map((s) => [s.place.kind, s.sites.map((x) => x.id)])).toEqual([
      ['group', ['d', 'b']],
      ['rest', ['a', 'c']],
    ])
    expect(l.groups[0].sites.sort()).toEqual(['b', 'd'])
  })
  it('keeps group names unique, and a removed group gives its sites back', () => {
    let l = addGroup(addGroup(EMPTY, 'Shops'), 'shops')
    expect(l.groups).toHaveLength(1)
    l = addGroup(l, 'Clients')
    expect(renameGroup(l, 'Clients', 'SHOPS')).toBe(l)
    l = moveTo(sites, l, 'a', { kind: 'group', name: 'Shops' })
    expect(stepGroup(l, 'Clients', -1).groups.map((g) => g.name)).toEqual(['Clients', 'Shops'])
    expect(ids(removeGroup(l, 'Shops'))).toContain('a')
    expect(sectionsOf(sites, removeGroup(l, 'Shops')).every((s) => s.place.kind !== 'group' || s.place.name !== 'Shops')).toBe(true)
  })
})
