import { describe, expect, it } from 'vitest'
import { momentsOf, startOf, type MomentsIn } from './model'

const words: MomentsIn['words'] = { starts: (n) => `${n} starts sending people`, mention: (h) => `a mention on ${h}`, down: (m, on) => `site down ${m} min${on ? ' and counting' : ''}`, sale: (k, a) => `${k} · ${a}` }

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
})
