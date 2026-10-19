import { describe, expect, it } from 'vitest'
import { feedOf, IDLE_MS, type Row } from '../../../features/live/model'
import type { NowVisit } from '../../../features/live/api'
import { agoOf, placeOf, pinsOf, spreadOf, thinning, unitOf, wrap } from './geo'

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
  it('puts people of one spot around it, each at a fixed place of their own that stays within a few degrees', () => {
    const crowd = Array.from({ length: 40 }, (_, i) => row(i))
    const a = pinsOf(crowd)
    expect(new Set(a.map((p) => `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`)).size).toBe(40)
    const mid = placeOf('DE', 'Berlin') ?? [0, 0]
    for (const p of a) {
      expect(Math.abs(p.lat - mid[0])).toBeLessThanOrEqual(2.5)
      expect(Math.abs(p.lon - mid[1])).toBeLessThanOrEqual(2.5 / Math.cos((mid[0] * Math.PI) / 180) + 0.01)
    }
    // The same person is in the same place whoever else is there.
    expect(pinsOf(crowd.slice(5, 12)).find((p) => p.key === 'v7')).toMatchObject({ key: 'v7' })
    expect(spreadOf('v7', 10)).toEqual(spreadOf('v7', 10))
    expect(spreadOf('v7', 1)).toEqual([0, 0])
  })
  it('gives each pin its place in a unit disc and the size of its crowd, for the spread a zoom opens', () => {
    const pins = pinsOf(Array.from({ length: 12 }, (_, i) => row(i)))
    for (const p of pins) {
      expect(Math.hypot(p.ux, p.uy)).toBeLessThanOrEqual(1)
      expect(p.crowd).toBe(12)
    }
    expect(unitOf('v7')).toEqual(unitOf('v7'))
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
  it('says seconds, then minutes, and thins the dots on small or weak devices', () => {
    expect(agoOf(15_000)).toEqual({ unit: 's', n: 15 })
    expect(agoOf(190_000)).toEqual({ unit: 'm', n: 3 })
    expect(thinning(390, 8, 8)).toBe(2)
    expect(thinning(1440, 4, 8)).toBe(2)
    expect(thinning(1440, 10, 16)).toBe(1)
  })
})
