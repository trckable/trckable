import { describe, expect, it } from 'vitest'
import type { Result } from '../../lib/api'
import { asOf, momentsOf, startOf, step, type MomentsIn } from './model'

const words: MomentsIn['words'] = { starts: (n) => `${n} starts sending people`, mention: (h) => `a mention on ${h}`, down: (m, on) => `site down ${m} min${on ? ' and counting' : ''}`, sale: (k, a) => `${k} · ${a}` }
const day = (xs: number[]): Result => ({
  approximate: false,
  kpis: { visitors: xs.reduce((a, b) => a + b, 0), sessions: 100, pageviews: 0, bounce_rate: 0, avg_session_s: 0, views_per_session: 0, new_visitor_share: 0 },
  series: xs.map((visitors, h) => ({ t: `2026-10-16T${String(h).padStart(2, '0')}:00`, visitors, pageviews: visitors })),
  dims: {},
  goals: null,
})

describe('replay', () => {
  it('finds the hour a source began to send a crowd', () => {
    expect(startOf([0, 0, 1, 2, 30, 90, 40])).toBe(240)
    expect(startOf([0, 1, 2])).toBeNull()
  })
  it('stops at what happened, in order, and not at what has not happened yet', () => {
    const m = momentsOf({ until: 16 * 60, source: { name: 'Hacker News', hourly: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 40, 95, 76] }, mention: { host: 'Hacker News', min: 14 * 60 + 5 }, downs: [{ min: 11 * 60, len: 23 }, { min: 20 * 60, len: null }], sales: [], words })
    expect(m.map((x) => x.txt)).toEqual(['11:00 · site down 23 min', '14:00 · Hacker News starts sending people', '14:05 · a mention on Hacker News'])
  })
  it('folds moments that are too close into the first', () => {
    const m = momentsOf({ until: 900, source: { name: 'X', hourly: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 20] }, mention: { host: 'X', min: 14 * 60 + 1 }, downs: [], sales: [], words })
    expect(m).toHaveLength(1)
  })
  it('the report at a time holds the hours so far and part of the hour it is', () => {
    const r = asOf(day([10, 10, 10, 10]), 90)
    expect(r.series.map((p) => p.visitors)).toEqual([10, 5, 0, 0])
    expect(r.kpis.visitors).toBe(15)
  })
  it('the whole day takes twenty seconds at normal speed', () => {
    expect(step(1000, 1) * (20000 / 45)).toBeCloseTo(1000)
    expect(step(1000, 4)).toBeCloseTo(step(1000, 1) * 4)
  })
})
