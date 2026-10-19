import { describe, expect, it } from 'vitest'
import { feedOf, IDLE_MS, type Row } from '../../../features/live/model'
import type { NowVisit } from '../../../features/live/api'
import { agoOf, placeOf, pinsOf, thinning, wrap } from './geo'

const at = (i: number, o: Partial<NowVisit> = {}): NowVisit => ({ kind: 'pageview', ts: 1000, last: 1000, path: `/p${i}`, visitor: `v${i}`, country: 'de', city: 'Berlin', ...o })
const row = (i: number, o: Partial<Row> = {}): Row => ({ ...at(i), key: `v${i}`, ...o })

describe('globe pins', () => {
  it('has exactly the people "On the site now" holds, grouped by spot, none idle past five minutes', () => {
    const now = 10 * IDLE_MS
    const recent = [
      at(1, { last: now - 1000 }),
      at(2, { last: now - 2000 }),
      at(3, { last: now - 3000, city: 'Munich' }),
      at(4, { last: now - 4000, country: 'jp', city: 'Tokyo' }),
      at(5, { last: now - IDLE_MS - 1, country: 'fr', city: 'Paris' }), // has left
    ]
    const online = feedOf(recent, [], now, now)
    const pins = pinsOf(online)
    expect(online.map((r) => r.visitor)).toEqual(['v1', 'v2', 'v3', 'v4'])
    expect(pins.reduce((n, p) => n + p.n, 0)).toBe(online.length)
    expect(pins.map((p) => [p.key, p.n])).toEqual([['DE/Berlin', 2], ['DE/Munich', 1], ['JP/Tokyo', 1]])
    expect(pins.find((p) => p.cc === 'FR')).toBeUndefined()
  })
  it('shows the newest page at a spot and a new arrival changes its signature', () => {
    const a = pinsOf([row(2, { last: 2000, path: '/new' }), row(1, { last: 1000, path: '/old' })])
    expect(a[0].path).toBe('/new')
    const b = pinsOf([row(3, { last: 3000 }), row(2, { last: 2000 }), row(1)])
    expect(b[0].sig).not.toBe(a[0].sig)
    expect(b[0].n).toBe(3)
  })
  it('leaves out a visit from an unknown country and keeps a city on the same spot every time', () => {
    expect(pinsOf([row(1, { country: undefined }), row(2, { country: 'zz' })])).toEqual([])
    expect(placeOf('DE', 'Berlin')).toEqual(placeOf('DE', 'Berlin'))
    expect(placeOf('DE', 'Berlin')).not.toEqual(placeOf('DE', 'Munich'))
    expect(placeOf('DE', '')).toEqual(placeOf('DE', ''))
  })
})

describe('globe maths', () => {
  it('keeps a longitude within a turn', () => {
    expect(wrap(190)).toBe(-170)
    expect(wrap(-190)).toBe(170)
  })
  it('says seconds, then minutes, and thins the dots on small or weak devices', () => {
    expect(agoOf(15_000)).toEqual({ unit: 's', n: 15 })
    expect(agoOf(190_000)).toEqual({ unit: 'm', n: 3 })
    expect(thinning(390, 8, 8)).toBe(2)
    expect(thinning(1440, 4, 8)).toBe(2)
    expect(thinning(1440, 10, 16)).toBe(1)
  })
})
