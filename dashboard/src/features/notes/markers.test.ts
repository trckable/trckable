import { describe, expect, it } from 'vitest'
import type { Annotation } from '../../lib/api'
import { bucketOf, markersFor, tipLeft } from './markers'

const note = (id: string, day: string): Annotation => ({ id, day, text: id, created_at: 0 })
const days = ['2026-09-20T00:00', '2026-09-21T00:00', '2026-09-22T00:00']

describe('bucketOf', () => {
  it('finds a day on a chart by day, and nothing outside it', () => {
    expect(bucketOf('2026-09-21', days, 'day')).toBe(1)
    expect(bucketOf('2026-09-19', days, 'day')).toBe(-1)
    expect(bucketOf('2026-09-23', days, 'day')).toBe(-1)
    expect(bucketOf('not a day', days, 'day')).toBe(-1)
  })
  it('puts a day into its week and month', () => {
    const weeks = ['2026-09-07T00:00', '2026-09-14T00:00', '2026-09-21T00:00']
    expect(bucketOf('2026-09-17', weeks, 'week')).toBe(1)
    expect(bucketOf('2026-09-27', weeks, 'week')).toBe(2)
    expect(bucketOf('2026-09-28', weeks, 'week')).toBe(-1)
    const months = ['2026-07-01T00:00', '2026-08-01T00:00', '2026-09-01T00:00']
    expect(bucketOf('2026-08-31', months, 'month')).toBe(1)
    expect(bucketOf('2026-10-01', months, 'month')).toBe(-1)
  })
  it('marks a day at its first hour on a chart by hour', () => {
    const hours = ['2026-09-20T22:00', '2026-09-20T23:00', '2026-09-21T00:00', '2026-09-21T01:00']
    expect(bucketOf('2026-09-21', hours, 'hour')).toBe(2)
    expect(bucketOf('2026-09-22', hours, 'hour')).toBe(-1)
  })
})

describe('markersFor', () => {
  it('stacks the notes of one day into one marker, in the chart order', () => {
    const m = markersFor([note('b', '2026-09-22'), note('a', '2026-09-20'), note('c', '2026-09-22'), note('x', '2026-10-01')], days, 'day')
    expect(m.map((k) => [k.i, k.notes.length])).toEqual([
      [0, 1],
      [2, 2],
    ])
  })
})

describe('tipLeft', () => {
  it('centres on the marker, never past either edge', () => {
    expect(tipLeft(200, 100, 400)).toBe(150)
    expect(tipLeft(5, 100, 400)).toBe(4)
    expect(tipLeft(398, 100, 400)).toBe(296)
  })
  it('fits a chart narrower than the tooltip', () => {
    expect(tipLeft(100, 260, 200)).toBe(4)
  })
})
