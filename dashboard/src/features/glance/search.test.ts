import { describe, expect, it } from 'vitest'
import { indexOf, pickOf, score, search, type Item } from './search'
import type { TileData } from './model'

const items: Item[] = [
  { kind: 'page', key: '/pricing', label: '/pricing', visitors: 300 },
  { kind: 'page', key: '/blog/ai-traffic', label: '/blog/ai-traffic', visitors: 120 },
  { kind: 'source', key: 'Search', label: 'Search', visitors: 900 },
  { kind: 'source', key: 'AI', label: 'AI assistants', visitors: 80 },
  { kind: 'country', key: 'DE', label: 'Germany', visitors: 500 },
  { kind: 'country', key: 'GB', label: 'United Kingdom', visitors: 200 },
  { kind: 'device', key: 'Mobile', label: 'Mobile', visitors: 700 },
  { kind: 'goal', key: 'signup', label: 'Sign-up', visitors: 40 },
]

describe('score', () => {
  it('ranks exact over prefix over word-start over contains', () => {
    expect(score('Search', 'search')).toBe(100)
    expect(score('Searching', 'search')).toBe(80)
    expect(score('/blog/ai-traffic', 'ai')).toBe(60)
    expect(score('Germany', 'man')).toBe(40)
    expect(score('Germany', 'xyz')).toBe(0)
  })
})

describe('search', () => {
  it('finds a page, a source, a country, a device and a goal', () => {
    expect(search(items, 'pric')[0].kind).toBe('page')
    expect(search(items, 'search')[0].kind).toBe('source')
    expect(search(items, 'germ')[0].kind).toBe('country')
    expect(search(items, 'mobi')[0].kind).toBe('device')
    expect(search(items, 'sign')[0].kind).toBe('goal')
  })
  it('ignores case and accents', () => {
    expect(search(items, 'GERMANY')[0].key).toBe('DE')
    expect(search([{ kind: 'country', key: 'CI', label: 'Côte d’Ivoire', visitors: 1 }], 'cote')[0].key).toBe('CI')
  })
  it('puts the better match first, then the bigger row', () => {
    const r = search(items, 'ai')
    expect(r[0].key).toBe('AI')
    expect(r[1].key).toBe('/blog/ai-traffic')
  })
  it('says nothing matches with an empty list', () => {
    expect(search(items, 'zzz')).toEqual([])
  })
  it('without a query offers the biggest of each kind', () => {
    const r = search(items, '  ')
    expect(r[0].key).toBe('Search')
    expect(r.length).toBeLessThanOrEqual(8)
    expect(r.filter((x) => x.kind === 'page').length).toBe(2)
  })
})

describe('pickOf', () => {
  it('opens the tile that shows the kind, filtered to the row', () => {
    expect(pickOf(items[0])).toEqual({ tile: 'carrying', key: '/pricing' })
    expect(pickOf(items[2])).toEqual({ tile: 'source', key: 'Search' })
    expect(pickOf(items[4])).toEqual({ tile: 'country', key: 'DE' })
    expect(pickOf(items[6])).toEqual({ tile: 'device', key: 'Mobile' })
    expect(pickOf(items[7])).toEqual({ tile: 'goals', key: 'signup' })
  })
})

describe('indexOf', () => {
  it('builds the index from the tiles, once per row', () => {
    const t = (key: TileData['key'], rows: TileData['rows']) => ({ key, rows }) as TileData
    const idx = indexOf([t('source', [{ key: 'Search', label: 'Search', visitors: 5 }]), t('staying', [{ key: '/a', label: '/a', visitors: 3 }]), t('carrying', [{ key: '/a', label: '/a', visitors: 3 }])])
    expect(idx.map((x) => x.kind)).toEqual(['source', 'page'])
  })
})
