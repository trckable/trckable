import { describe, expect, it } from 'vitest'
import { countAt, pickCaps, seriesCaps, type Cap } from './lab'

const cap = (pos: number, kind: Cap['kind']): Cap => ({ pos, at: '', line: kind, kind })

describe('pickCaps', () => {
  it('tells the important one when two are too close, and keeps the order of the line', () => {
    const got = pickCaps([cap(0.5, 'best'), cap(0.52, 'sale'), cap(0.1, 'first'), cap(0.8, 'jump')])
    expect(got.map((c) => c.kind)).toEqual(['first', 'sale', 'jump'])
  })
  it('tells at most six', () => {
    expect(pickCaps([0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1].map((p) => cap(p, 'jump')))).toHaveLength(6)
  })
})

describe('seriesCaps', () => {
  const stamp = (i: number) => `${i}:00`
  it('finds the first visit, the biggest jump and the busiest hour of a day', () => {
    const got = seriesCaps({ vals: [0, 0, 2, 3, 40, 30, 12, 5], stamp, bucket: 'hour' })
    expect(got.map((c) => [c.kind, c.at])).toEqual([['first', '2:00'], ['jump', '4:00'], ['best', '4:00']])
  })
  it('has no first visit for a period of days, and no jump in a flat line', () => {
    const got = seriesCaps({ vals: [10, 11, 10, 12, 11], stamp, bucket: 'day' })
    expect(got.map((c) => c.kind)).toEqual(['best'])
  })
  it('uses the chart’s own label for the rise, and the sale it is given', () => {
    const got = seriesCaps({ vals: [1, 2, 30, 4], stamp, bucket: 'hour', rise: { i: 2, text: 'Hacker News · 9×' }, sale: { i: 3, text: '$49' } })
    expect(got.find((c) => c.kind === 'jump')?.line).toBe('Hacker News · 9×')
    expect(got.find((c) => c.kind === 'sale')?.line).toBe('First sale $49')
  })
})

describe('countAt', () => {
  it('climbs with the line and lands on the real total', () => {
    const v = [1, 3, 6]
    expect(countAt(v, 8, 1)).toBe(8)
    expect(countAt(v, 8, 0.5)).toBeGreaterThan(countAt(v, 8, 0.1))
    expect(countAt(v, 8, 0.5)).toBeLessThan(8)
  })
})
