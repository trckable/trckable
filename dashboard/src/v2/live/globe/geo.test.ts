import { describe, expect, it } from 'vitest'
import { feedOf, IDLE_MS, type Row } from '../../../features/live/model'
import type { NowVisit } from '../../../features/live/api'
import { cityAt } from './cities'
import { agoOf, placeOf, pinsOf, spotsOf, wrap } from './geo'

const at = (i: number, o: Partial<NowVisit> = {}): NowVisit => ({ kind: 'pageview', ts: 1000, last: 1000, path: `/p${i}`, visitor: `v${i}`, country: 'de', city: 'Berlin', ...o })
const row = (i: number, o: Partial<Row> = {}): Row => ({ ...at(i), key: `v${i}`, ...o })

describe('globe pins', () => {
  it('has one pin for each person "On the site now" holds, none idle past five minutes', () => {
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
    expect(pins.map((p) => p.key)).toEqual(online.map((r) => r.key))
    expect(pins.find((p) => p.cc === 'FR')).toBeUndefined()
  })
  it('puts people of one spot on that spot and counts them, and groups them into one marker led by the newest', () => {
    const crowd = [row(1, { last: 1000 }), row(2, { last: 3000 }), row(3, { last: 2000 }), row(4, { country: 'jp', city: 'Tokyo' })]
    const pins = pinsOf(crowd)
    expect(pins.filter((p) => p.cc === 'DE').map((p) => p.crowd)).toEqual([3, 3, 3])
    expect(new Set(pins.filter((p) => p.cc === 'DE').map((p) => `${p.lat},${p.lon}`)).size).toBe(1)
    const spots = spotsOf(pins)
    expect([...spots.keys()]).toEqual(['DE/Berlin', 'JP/Tokyo'])
    expect(spots.get('DE/Berlin')?.lead.key).toBe('v2')
    expect(spots.get('DE/Berlin')?.members).toEqual(['v1', 'v2', 'v3'])
  })
  it('shows the newest page and a new action changes the pin signature', () => {
    const a = pinsOf([row(1, { last: 1000, path: '/old' })])
    const b = pinsOf([row(1, { last: 2000, path: '/new' })])
    expect(b[0].path).toBe('/new')
    expect(b[0].sig).not.toBe(a[0].sig)
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
  it('says seconds, then minutes', () => {
    expect(agoOf(15_000)).toEqual({ unit: 's', n: 15 })
    expect(agoOf(190_000)).toEqual({ unit: 'm', n: 3 })
  })
})

describe('a pin on its city', () => {
  it('sits on the listed city, whatever the accents or case, and on the country middle for one that is not listed', () => {
    expect(cityAt('DE', 'Berlin')).toEqual([52.52, 13.4])
    expect(cityAt('BR', 'sao PAULO')).toEqual([-23.55, -46.63])
    expect(cityAt('CO', 'Bogota')).toEqual([4.71, -74.07])
    expect(cityAt('DE', 'Smallville')).toBeNull()
    expect(cityAt('DE', '')).toBeNull()
  })
  it('does not take a same-named city from the other side of the world', () => {
    expect(cityAt('ES', 'Santiago')).toBeNull() // the listed Santiago is in Chile
    expect(cityAt('CL', 'Santiago')).toEqual([-33.45, -70.67])
  })
  it('puts the pin on the city when the finder knows it, and keeps the jitter around the country otherwise', () => {
    const pins = pinsOf([row(1, { city: 'Berlin' }), row(2, { city: 'Smallville' })], cityAt)
    expect([pins[0].lat, pins[0].lon]).toEqual([52.52, 13.4])
    expect([pins[1].lat, pins[1].lon]).toEqual(placeOf('DE', 'Smallville'))
  })
})
