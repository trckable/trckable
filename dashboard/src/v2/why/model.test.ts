import { describe, expect, it } from 'vitest'
import type { Result } from '../../lib/api'
import { explain, movers } from './model'

const result = (visitors: number, referrer: [string, number][], country: [string, number][] = []): Result =>
  ({
    kpis: { visitors, pageviews: visitors },
    series: [],
    goals: null,
    dims: {
      referrer: referrer.map(([value, v]) => ({ value, visitors: v })),
      country: country.map(([value, v]) => ({ value, visitors: v })),
    },
  }) as unknown as Result

describe('explain', () => {
  it('splits a drop into movers that, with the rest, add up to the gap', () => {
    const w = explain(result(300, [['Google', 100], ['Direct', 200]]), result(500, [['Google', 300], ['Direct', 200]]), 'visitors')
    expect(w.kind).toBe('moved')
    expect(w.causes[0]).toMatchObject({ value: 'Google', diff: -200 })
    expect(w.causes.reduce((a, c) => a + c.diff, w.rest)).toBe(w.diff)
  })
  it('sees a total that held while what is inside it moved', () => {
    const w = explain(result(500, [['Google', 100], ['HN', 400]]), result(500, [['Google', 400], ['HN', 100]]), 'visitors')
    expect(w.kind).toBe('mix')
    expect(w.causes).toHaveLength(2)
  })
  it('says nothing changed when nothing did', () => {
    expect(explain(result(500, [['Google', 500]]), result(505, [['Google', 505]]), 'visitors').kind).toBe('flat')
  })
  it('will not explain too little', () => {
    expect(explain(result(5, [['Google', 5]]), result(9, [['Google', 9]]), 'visitors').kind).toBe('few')
  })
  it('does not call a value new when a long list may have cut it off', () => {
    const long = Array.from({ length: 10 }, (_, i): [string, number] => [`s${i}`, 50 - i])
    const w = explain(result(400, [['New', 60], ...long]), result(400, long), 'visitors')
    expect(w.causes.find((c) => c.value === 'New')?.was ?? 41).toBe(41)
  })
})

describe('movers', () => {
  it('ranks the movers of every table together, by size', () => {
    const list = movers(result(300, [['Google', 100], ['Direct', 200]], [['US', 50], ['DE', 250]]), result(500, [['Google', 300], ['Direct', 200]], [['US', 250], ['DE', 250]]), 'visitors')
    expect(list.map((c) => `${c.dim}:${c.value}:${c.diff}`)).toEqual(['referrer:Google:-200', 'country:US:-200'])
  })
  it('leaves out wobble and caps the list at eight', () => {
    expect(movers(result(500, [['Google', 500]]), result(505, [['Google', 505]]), 'visitors')).toEqual([])
    const many = (n: number) => Array.from({ length: 12 }, (_, i): [string, number] => [`s${i}`, n * (i + 1)])
    expect(movers(result(1000, many(10)), result(2000, many(30)), 'visitors')).toHaveLength(8)
  })
  it('says nothing about too little', () => {
    expect(movers(result(5, [['Google', 5]]), result(9, [['Google', 9]]), 'visitors')).toEqual([])
  })
})
