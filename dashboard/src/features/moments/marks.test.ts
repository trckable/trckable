import { describe, expect, it } from 'vitest'
import { bucketAt, MARK_EDGE, MARK_GAP, MAX_MARKS, pickMarks, placePins, tipOf } from './marks'
import type { Pin, PinKind } from './pins'

const pin = (kind: PinKind, day: string, score: number, at?: string): Pin => ({ id: `${kind}:${day}:${score}`, kind, score, day, at, filters: [], showDay: false, n: {} })
const days = Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}T00:00`)
const x = (i: number) => i * (MARK_GAP + 8) // wider apart than a marker: nothing is close

describe('where a pin sits', () => {
  it('on the bucket of its day, and nowhere when the chart does not show it', () => {
    expect(bucketAt(pin('spike', '2026-09-19', 90), days, 'day')).toBe(18)
    expect(bucketAt(pin('spike', '2026-10-19', 90), days, 'day')).toBe(-1)
  })

  it('on the week or the month that holds the day', () => {
    const weeks = ['2026-09-07T00:00', '2026-09-14T00:00', '2026-09-21T00:00']
    expect(bucketAt(pin('referrer', '2026-09-16', 50), weeks, 'week')).toBe(1)
  })

  it('by the hour, at the hour the server named; a finding without one goes to the first hour of its day', () => {
    const hours = ['2026-09-19T08:00', '2026-09-19T09:00', '2026-09-19T10:00', '2026-09-20T08:00']
    expect(bucketAt(pin('spike', '2026-09-19', 90, '2026-09-19T09:00'), hours, 'hour')).toBe(1)
    expect(bucketAt(pin('referrer', '2026-09-20', 50), hours, 'hour')).toBe(3)
  })

  it('a pin with no day has no place', () => {
    const p = { ...pin('move', '', 70), day: undefined }
    expect(placePins([p], days, 'day')).toEqual([])
  })
})

describe('which markers the chart shows', () => {
  it('at most six, the most important first', () => {
    const pins = Array.from({ length: 10 }, (_, k) => pin('sale', `2026-09-${String(k + 2).padStart(2, '0')}`, 60 + k))
    const marks = pickMarks(placePins(pins, days, 'day'), x)
    expect(marks).toHaveLength(MAX_MARKS)
    expect(marks.map((m) => m.pin.score).sort((a, b) => b - a)).toEqual([69, 68, 67, 66, 65, 64])
  })

  it('in the chart\'s order, whatever their importance', () => {
    const marks = pickMarks(placePins([pin('spike', '2026-09-20', 95), pin('sale', '2026-09-03', 60)], days, 'day'), x)
    expect(marks.map((m) => m.i)).toEqual([2, 19])
  })

  it('markers that land close are one, the most important on top, saying how many', () => {
    const near = pickMarks(placePins([pin('sale', '2026-09-10', 62), pin('spike', '2026-09-10', 90), pin('ai', '2026-09-11', 55)], days, 'day'), (i) => i * (MARK_GAP / 2))
    expect(near).toHaveLength(1)
    expect(near[0].pin.kind).toBe('spike')
    expect(near[0].more.map((p) => p.kind)).toEqual(['sale', 'ai'])
  })

  it('clustering does not use up the six', () => {
    const crowd = Array.from({ length: 8 }, (_, k) => pin('sale', '2026-09-10', 60 + k))
    const others = [3, 7, 14, 18, 24].map((d) => pin('spike', `2026-09-${String(d).padStart(2, '0')}`, 90))
    const marks = pickMarks(placePins([...crowd, ...others], days, 'day'), x)
    expect(marks).toHaveLength(6)
    expect(marks.find((m) => m.i === 9)?.more).toHaveLength(7)
  })

  it('nothing when there is nothing', () => {
    expect(pickMarks([], x)).toEqual([])
  })
})

describe('a marker, its count and its neighbours', () => {
  const hours = Array.from({ length: 72 }, (_, i) => `2026-09-${String(10 + Math.floor(i / 24))}T${String(i % 24).padStart(2, '0')}:00`)
  const sale = (at: string, score: number) => ({ ...pin('sale', at.slice(0, 10), score, at), id: `sale:${at}` })

  it('one a day: the hours of a day are one marker, on the most important one\'s hour', () => {
    const placed = placePins([sale('2026-09-10T03:00', 61), sale('2026-09-10T20:00', 70), sale('2026-09-11T05:00', 65)], hours, 'hour')
    const marks = pickMarks(placed, (i) => i * 60)
    expect(marks).toHaveLength(2)
    expect(marks[0].i).toBe(20)
    expect(marks[0].more).toHaveLength(1)
    const days = marks.flatMap((m) => [m.pin, ...m.more].map((q) => q.day))
    expect(new Set(days).size).toBe(days.length - 1)
  })

  it('no two markers are closer than the widest one is wide, count included', () => {
    const pins = Array.from({ length: 20 }, (_, k) => pin(k % 2 ? 'sale' : 'spike', `2026-09-${String(k + 1).padStart(2, '0')}`, 50 + k))
    const marks = pickMarks(placePins(pins, days, 'day'), (i) => i * 14, [44, 500])
    for (const [a, b] of marks.slice(1).map((m, k) => [marks[k], m])) expect(b.at - a.at).toBeGreaterThanOrEqual(MARK_GAP)
  })

  it('a marker at the chart\'s edge is moved in, so its count is never cut off, and the neighbour keeps its room', () => {
    const edge: [number, number] = [44, 400 - MARK_EDGE]
    const marks = pickMarks(placePins([pin('spike', '2026-09-01', 90), pin('spike', '2026-09-30', 80), pin('sale', '2026-09-29', 70)], days, 'day'), (i) => 44 + (i * 356) / 29, edge)
    for (const m of marks) {
      expect(m.at).toBeGreaterThanOrEqual(edge[0])
      expect(m.at).toBeLessThanOrEqual(edge[1])
    }
    expect(marks).toHaveLength(2) // the 29th is as close to the 30th as the edge leaves it: they are one, the count says so
    expect(marks[1].more).toHaveLength(1)
  })
})


describe('the line a marker says', () => {
  const marks = pickMarks(placePins([pin('spike', '2026-09-10', 90), pin('sale', '2026-09-20', 70)], days, 'day'), x)

  it('is on show for the marker pointed at', () => {
    expect(tipOf(marks, marks[1].i, false)).toBe(marks[1])
    expect(tipOf(marks, null, false)).toBeUndefined()
  })

  it('is never on show while a card is open: pointing at another marker only lights it', () => {
    expect(tipOf(marks, marks[0].i, true)).toBeUndefined()
    expect(tipOf(marks, marks[1].i, true)).toBeUndefined()
  })
})
