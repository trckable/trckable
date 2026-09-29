import { describe, expect, it } from 'vitest'
import { replayPath, replayStart } from './useReplay'
import { advance, commitAt, fmtSecs, rateOf, replaySeconds, speedId, speedOf, SPEEDS } from './replayTime'
import { raceAt, type Part } from './useRace'
import { pointOn, smooth } from '../../charts/smooth'

describe('replayStart', () => {
  it('starts on the chart\'s first point, a new site\'s first visit', () => {
    expect(replayStart(5, -1, 7)).toBe(5)
    expect(replayStart(0, -1, 48)).toBe(0)
  })
  it('never starts before that first point', () => {
    expect(replayStart(5, 2, 7)).toBe(5)
  })
  it('picks up where it was paused, and starts over from the last point', () => {
    expect(replayStart(0, 20, 48)).toBe(20)
    expect(replayStart(3, 6, 7)).toBe(3)
  })
})

describe('replayPath', () => {
  it('visits every point from the start', () => {
    expect(replayPath(2, 5)).toEqual([2, 3, 4])
  })
  it('with reduced motion, only the moments from the start, then the end', () => {
    expect(replayPath(2, 10, [1, 4, 7])).toEqual([2, 4, 7, 9])
    expect(replayPath(0, 5, [4])).toEqual([0, 4])
  })
})

describe('speeds', () => {
  it('are durations, from slowest to fastest', () => {
    const secs = SPEEDS.map((s) => s.secs)
    expect(secs).toEqual([...secs].sort((a, b) => b - a))
    expect(speedOf('normal').secs).toBe(20)
  })
  it('read the speeds saved as 1×, 2× and 4×, and fall back to Normal', () => {
    expect(speedId('fast')).toBe('fast')
    expect(speedId('2')).toBe('fast')
    expect(speedId('nonsense')).toBe('normal')
    expect(speedId(null)).toBe('normal')
  })
})

describe('replaySeconds', () => {
  it('is the preset itself for a usual month', () => {
    expect(replaySeconds(30, 20)).toBe(20)
  })
  it('scales with the period: a week is shorter than a year, neither absurd', () => {
    const week = replaySeconds(7, 20)
    const year = replaySeconds(400, 20)
    expect(week).toBeLessThan(20)
    expect(year).toBeGreaterThan(20)
    expect(year).toBeLessThan(60)
    expect(week).toBeGreaterThan(5)
  })
  it('stays within a moment and a minute', () => {
    expect(replaySeconds(1, 2)).toBeGreaterThanOrEqual(1.5)
    expect(replaySeconds(100000, 40)).toBeLessThanOrEqual(60)
  })
  it('is written for the menu', () => {
    expect(fmtSecs(20)).toBe('~20 s')
    expect(fmtSecs(4.2)).toBe('~4 s')
    expect(fmtSecs(9.7)).toBe('~9.5 s')
  })
})

describe('the playhead', () => {
  it('crosses the whole path in the time asked for, at any frame rate', () => {
    const rate = rateOf(0, 31, 20) // 30 steps in 20 s
    for (const fps of [30, 60, 144]) {
      let pos = 0
      const dt = 1000 / fps
      for (let t = 0; t < 10_000; t += dt) pos = advance(pos, dt, rate, 30)
      expect(pos).toBeCloseTo(15, 0)
    }
  })
  it('stops at the last point', () => {
    expect(advance(29.9, 200, rateOf(0, 31, 1), 30)).toBe(30)
  })
  it('changes speed without a jump: only the pace changes', () => {
    const slow = rateOf(0, 31, 40)
    const fast = rateOf(0, 31, 5)
    const before = advance(10, 16, slow, 30)
    const after = advance(before, 16, fast, 30)
    expect(before).toBeGreaterThanOrEqual(10)
    expect(before - 10).toBeCloseTo(16 * slow, 6)
    expect(after - before).toBeCloseTo(16 * fast, 6)
    expect(after - before).toBeLessThan(0.2)
  })
  it('does not leap after a stalled frame', () => {
    expect(advance(3, 5000, rateOf(0, 31, 20), 30)).toBeLessThan(3.5)
  })
})

describe('commitAt', () => {
  it('holds back the points in passing, one per interval', () => {
    expect(commitAt(4.2, 3, undefined, 100, 220)).toBeNull()
    expect(commitAt(4.2, 3, undefined, 230, 220)).toBe(4)
    expect(commitAt(3.9, 3, undefined, 999, 220)).toBeNull()
  })
  it('never skips or delays a moment', () => {
    expect(commitAt(6.1, 3, [5, 9], 10, 220)).toBe(5)
    expect(commitAt(6.1, 5, [5, 9], 10, 220)).toBeNull()
    expect(commitAt(9, 5, [5, 9], 0, 220)).toBe(9)
  })
})

describe('the tiles between two points', () => {
  const parts: Part[] = [10, 20, 30].map((v) => ({ visitors: v, sessions: v, pageviews: v * 2, bounced: 0, secs: 0, fresh: 0, revenue: v * 100 }))
  const at = raceAt(parts, 1)
  it('are the running total at a point', () => {
    expect(at(0).kpis.visitors).toBe(10)
    expect(at(1).kpis.visitors).toBe(30)
    expect(at(2).revenue).toBe(6000)
  })
  it('climb steadily between two points', () => {
    expect(at(1.5).kpis.visitors).toBe(45)
    expect(at(1.25).kpis.pageviews).toBeCloseTo(60 + 0.25 * 60, 6)
  })
  it('land on the period\'s figure, and never past it', () => {
    expect(raceAt(parts, 0.5)(99).kpis.visitors).toBe(30)
  })
})

describe('the marker on the line', () => {
  const pts = [[0, 100], [10, 40], [20, 70], [30, 10]]
  it('sits on the points, and between them stays between their heights', () => {
    expect(pointOn(pts, 1)).toEqual([10, 40])
    const [x, y] = pointOn(pts, 1.5)
    expect(x).toBeCloseTo(15, 6)
    expect(y).toBeGreaterThanOrEqual(40)
    expect(y).toBeLessThanOrEqual(70)
  })
  it('agrees with the drawn curve at its points', () => {
    expect(smooth(pts)).toContain('20.0 70.0')
    expect(pointOn(pts, 2)[1]).toBeCloseTo(70, 6)
  })
})
