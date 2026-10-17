import { describe, expect, it } from 'vitest'
import type { Row } from '../../features/live/model'
import { barsOf, changeOf, deviceSplit, listsOf, place, sourceParts, todayBand } from './liveModel'

const row = (i: number, o: Partial<Row> = {}): Row => ({ kind: 'pageview', ts: 0, last: 0, path: '/p', visitor: `v${i}`, key: `v${i}`, ...o })

describe('Live', () => {
  it('draws the half hour as bars of the tallest, at least 3%, flagged when empty', () => {
    expect(barsOf([0, 5, 10])).toEqual([{ h: 3, z: true }, { h: 50, z: false }, { h: 100, z: false }])
    expect(barsOf([0, 0])[0].h).toBe(3)
  })
  it('says the change against the half hour before only when there was something to compare', () => {
    expect(changeOf(80, 100)).toEqual({ up: false, pct: 20 })
    expect(changeOf(150, 100)).toEqual({ up: true, pct: 50 })
    expect(changeOf(5, 3)).toBeNull()
  })
  it('splits the sources into the top five over 1%, and the rest', () => {
    const s = sourceParts([{ channel: 'Search', visitors: 50 }, { channel: 'Direct', visitors: 40 }, { channel: 'Social', visitors: 9 }, { channel: 'X', visitors: 1 }])
    expect(s.parts.map((p) => p.pct)).toEqual([50, 40, 9])
    expect(s.other).toBeCloseTo(0.01, 2)
    expect(sourceParts([])).toEqual({ parts: [], other: 0 })
  })
  it('puts today above, inside or below last week\'s band', () => {
    expect(todayBand(100, 50, true)?.word).toBe('above')
    expect(todayBand(50, 50, true)?.word).toBe('usual')
    expect(todayBand(10, 50, true)?.word).toBe('below')
    expect(todayBand(10, 0, true)).toBeNull()
    expect(todayBand(10, 50, false)).toBeNull()
  })
  it('keeps a mark off the ends of its bar', () => {
    expect([place(0, 10), place(5, 10), place(10, 10)]).toEqual([2, 50, 98])
  })
  it('lists five pages and five countries', () => {
    const rows = [row(1, { path: '/a', country: 'US', device: 'mobile' }), row(2, { path: '/a', country: 'US', device: 'desktop' }), row(3, { path: '/b', country: 'DE' })]
    const l = listsOf(rows)
    expect(l.pages).toEqual([{ label: '/a', n: 2 }, { label: '/b', n: 1 }])
    expect(l.countries.map((c) => [c.label, c.n])).toEqual([['United States', 2], ['Germany', 1]])
  })

  it('splits phone against computer from the people whose device is known', () => {
    expect(deviceSplit([row(1, { device: 'mobile' }), row(2, { device: 'desktop' }), row(3, { device: 'desktop' }), row(4, { device: 'tablet' })])).toEqual({ phone: 0.5, computer: 0.5 })
    expect(deviceSplit([row(1)])).toBeNull()
  })
})
