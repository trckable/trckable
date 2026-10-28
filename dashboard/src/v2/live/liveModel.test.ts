import { describe, expect, it } from 'vitest'
import type { Row } from '../../features/live/model'
import { peopleAt } from '../../features/live/model'
import type { LiveNow } from '../../features/live/api'
import { fitOf } from './cardWidth'
import { visitors30, barsOf, changeOf, deviceCounts, listsOf, place, sourceParts, todayBand, usualLine } from './liveModel'

const row = (i: number, o: Partial<Row> = {}): Row => ({ kind: 'pageview', ts: 0, last: 0, path: '/p', visitor: `v${i}`, key: `v${i}`, ...o })

describe('Live', () => {
  it('draws the half hour as bars of the tallest, at least 3%, flagged when empty', () => {
    expect(barsOf([0, 5, 10])).toEqual([{ h: 3, z: true, n: 0 }, { h: 50, z: false, n: 5 }, { h: 100, z: false, n: 10 }])
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

  it('shows sources that add up to the half hour: each visitor is one source', () => {
    const sources = [{ channel: 'Search', visitors: 11 }, { channel: 'Direct', visitors: 4 }]
    const sum = sourceParts(sources).parts.reduce((n, p) => n + p.n, 0)
    expect(sum).toBe(visitors30(15, 3))
    expect(sourceParts(sources).parts.map((p) => p.pct)).toEqual([73, 27])
  })
  it('puts today above, inside or below last week\'s band', () => {
    expect(todayBand(100, 50, true)?.word).toBe('above')
    expect(todayBand(50, 50, true)?.word).toBe('usual')
    expect(todayBand(10, 50, true)?.word).toBe('below')
    expect(todayBand(10, 0, true)).toBeNull()
    expect(todayBand(10, 50, false)).toBeNull()
  })
  it('tells the line under today\'s number: which way and by how many percent, nothing on a thin last week', () => {
    expect(usualLine(132, 100, true)).toEqual({ tone: 'up', pct: 32 })
    expect(usualLine(78, 100, true)).toEqual({ tone: 'dn', pct: 22 })
    expect(usualLine(105, 100, true)).toEqual({ tone: 'flat', pct: 5 })
    expect(usualLine(30, 10, true)).toBeNull() // last week had fewer than 20 people
    expect(usualLine(2100, 100, true)).toBeNull() // over ten times it
    expect(usualLine(100, 100, false)).toBeNull()
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
    expect(listsOf([row(1, { device: 'mobile' }), row(2, { device: 'desktop' }), row(3, { device: 'desktop' }), row(4, { device: 'tablet' }), row(5)]).devices).toEqual([{ key: 'phone', n: 2 }, { key: 'computer', n: 2 }])
    expect(deviceCounts([['Desktop', 5], ['Mobile', 3], ['Tablet', 1], ['Bot', 9]])).toEqual([{ key: 'computer', n: 5 }, { key: 'phone', n: 4 }])
    expect(listsOf([row(1)]).devices).toEqual([])
  })
})

describe('visitors30', () => {
  it('is never less than the people online, at every tick', () => {
    for (let visitors = 0; visitors < 6; visitors++) {
      for (let online = 0; online < 6; online++) expect(visitors30(visitors, online)).toBeGreaterThanOrEqual(online)
    }
    expect(visitors30(1, 3)).toBe(3)
    expect(visitors30(5, 3)).toBe(5)
    expect(visitors30(4, null)).toBe(4)
  })
})

describe('a quiet half hour', () => {
  it('draws one visit as a short bar', () => expect(barsOf([0, 0, 1]).map((b) => b.h)).toEqual([3, 3, 25]))
})

describe('fitOf', () => {
  it('tells how roomy the card is', () => {
    expect([fitOf(420), fitOf(479), fitOf(480), fitOf(559), fitOf(560), fitOf(900)]).toEqual(['tiny', 'tiny', 'narrow', 'narrow', 'wide', 'wide'])
  })
})

describe('the line of people on the site', () => {
  const read = { at: 0, start: 0, minutes: [0, 0, 0], online_minutes: [2, 4, 3], online: 3 } as unknown as LiveNow
  it('plots the read series and pins its end to the live count', () => {
    expect(peopleAt(read, 3, 2 * 60_000)).toEqual([2, 4, 3])
    expect(peopleAt(read, 5, 2 * 60_000)).toEqual([2, 4, 5])
  })
  it('moves on with the clock, carrying the live count into the minutes that passed', () => {
    expect(peopleAt(read, 3, 4 * 60_000)).toEqual([3, 3, 3])
    expect(peopleAt(read, 6, 3 * 60_000)).toEqual([4, 3, 6])
  })
})
