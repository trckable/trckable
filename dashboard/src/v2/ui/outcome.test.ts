import { describe, expect, it } from 'vitest'
import { apart, barScale, barWidth, bucketAt, facesOf, outcomeOf, type Mark } from './outcome'

const hours = Array.from({ length: 24 }, (_, h) => `2026-11-09T${String(h).padStart(2, '0')}:00`)
const mk = (at: string, id: string, size: number): Mark => ({ at, id, text: `$${size}`, size })

describe('the outcome of a site', () => {
  it('is revenue first, then sign-ups, then pageviews', () => {
    expect(outcomeOf({ money: true, signup: true })).toBe('revenue')
    expect(outcomeOf({ money: false, signup: true })).toBe('signups')
    expect(outcomeOf({ money: false, signup: false })).toBe('views')
  })
})

describe('the right-hand axis', () => {
  it('has only a baseline when nothing was counted', () => {
    expect(barScale([0, 0, 0])).toEqual({ max: 1, ticks: [0] })
  })
  it('scales to one big sale and rounds the top', () => {
    const s = barScale([0, 0, 12900, 0])
    expect(s.ticks[0]).toBe(0)
    expect(s.max).toBeGreaterThanOrEqual(12900)
    expect(s.ticks[2]).toBe(s.max)
  })
  it('keeps bars thin but visible at 365 buckets', () => {
    expect(barWidth(900, 365)).toBeGreaterThanOrEqual(1.5)
    expect(barWidth(900, 365)).toBeLessThan(2.5)
    expect(barWidth(900, 24)).toBeLessThanOrEqual(16)
  })
})

describe('faces', () => {
  it('finds the bucket a moment falls in', () => {
    expect(bucketAt(hours, '2026-11-09T10:42')).toBe(10)
    expect(bucketAt(hours, '2026-11-08T23:00')).toBe(-1)
  })
  it('groups a bucket into one face with the count of the rest', () => {
    const f = facesOf(hours, [mk('2026-11-09T10:05', 'a', 10), mk('2026-11-09T10:30', 'b', 50), mk('2026-11-09T10:50', 'c', 5), mk('2026-11-09T12:00', 'd', 7)])
    expect(f).toHaveLength(2)
    expect(f[0]).toMatchObject({ i: 10, id: 'b', more: 2 })
    expect(f[1]).toMatchObject({ i: 12, id: 'd', more: 0 })
  })
  it('keeps the biggest when there are too many', () => {
    const marks = hours.map((t, k) => mk(t, `v${k}`, k + 1))
    const f = facesOf(hours, marks, 5)
    expect(f.map((x) => x.id)).toEqual(['v19', 'v20', 'v21', 'v22', 'v23'])
  })
  it('drops a face that sits on a bigger neighbour', () => {
    const f = facesOf(hours, [mk('2026-11-09T10:00', 'a', 9), mk('2026-11-09T11:00', 'b', 3)])
    expect(apart(f, (i) => i * 10).map((x) => x.id)).toEqual(['a'])
    expect(apart(f, (i) => i * 30).map((x) => x.id)).toEqual(['a', 'b'])
  })
  it('draws nothing for a moment past the period', () => {
    expect(facesOf(hours, [mk('2026-11-10T01:00', 'a', 1)])).toEqual([])
  })
})
