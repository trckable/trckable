import { describe, expect, it } from 'vitest'
import { downSeconds, insideSeconds } from './outage'

describe('minutes down inside the period', () => {
  const from = 1_000_000
  const to = from + 86400
  it('counts only the part of an outage inside the period', () => {
    // started 60 min before the period, ended 40 min into it: 40 min count
    expect(insideSeconds({ started_at: from - 3600, ended_at: from + 2400 }, from, to, to)).toBe(2400)
    // one still going ends at now, cut at the period's end
    expect(insideSeconds({ started_at: to - 600, ended_at: null }, from, to, to + 5000)).toBe(600)
    expect(insideSeconds({ started_at: from - 900, ended_at: from - 300 }, from, to, to)).toBe(0)
  })
  it('adds the outages up with the one rule', () => {
    const list = [{ started_at: from - 3600, ended_at: from + 2400 }, { started_at: from + 7200, ended_at: from + 7800 }]
    expect(downSeconds(list, from, to, to) / 60).toBe(50)
  })
})
