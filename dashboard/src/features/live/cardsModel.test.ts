import { describe, expect, it } from 'vitest'
import { linePoints, moveOf, placesOf, topPages } from './cardsModel'
import type { Row } from './model'

const T0 = Date.UTC(2026, 9, 7, 12)
const row = (i: number, o: Partial<Row> = {}): Row => ({ kind: 'pageview', ts: T0, last: T0, path: '/a', key: 'k' + String(i), ...o })

describe('today against last week', () => {
  it('is up, down or flat, flat within 2%', () => {
    expect(moveOf(112, 100)).toEqual({ dir: 'up', pct: 12 })
    expect(moveOf(80, 100)).toEqual({ dir: 'down', pct: 20 })
    expect(moveOf(101, 100)?.dir).toBe('flat')
    expect(moveOf(98, 100)?.dir).toBe('flat')
    expect(moveOf(97, 100)?.dir).toBe('down')
  })
  it('says nothing without a week before it', () => {
    expect(moveOf(5, 0)).toBeNull()
    expect(moveOf(5, 10, false)).toBeNull()
  })
})

describe('top pages', () => {
  it('counts people per page, most first, three at most', () => {
    const rows = [row(1, { path: '/b' }), row(2, { path: '/a' }), row(3, { path: '/a' }), row(4, { path: '/c' }), row(5, { path: '/d' }), row(6, { kind: 'goal', goal: 'x', path: '/a' }), row(7, { kind: 'active', path: undefined })]
    expect(topPages(rows)).toEqual([
      { key: '/a', n: 2 },
      { key: '/b', n: 1 },
      { key: '/c', n: 1 },
    ])
  })
})

describe('where they are from', () => {
  it('is null when nobody has a country', () => {
    expect(placesOf([row(1)])).toBeNull()
  })
  it('gives the top share, the parts and the device split', () => {
    const rows = [row(1, { country: 'al', device: 'mobile' }), row(2, { country: 'AL', device: 'mobile' }), row(3, { country: 'AL', device: 'desktop' }), row(4, { country: 'XK' })]
    const p = placesOf(rows)
    expect(p?.top).toEqual({ code: 'AL', share: 0.75 })
    expect(p?.parts.map((x) => [x.key, x.n])).toEqual([['AL', 3], ['XK', 1]])
    expect(p?.mobile).toBeCloseTo(2 / 3)
    expect(p?.desktop).toBeCloseTo(1 / 3)
  })
})

describe('the lines', () => {
  it('draws nothing for one point and the top of the box for the biggest', () => {
    expect(linePoints([3], 3, 300, 44)).toBe('')
    expect(linePoints([0, 4], 4, 300, 44)).toBe('0.0,42.5 300.0,1.5')
  })
})
