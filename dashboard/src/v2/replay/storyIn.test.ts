import { describe, expect, it } from 'vitest'
import type { Point } from '../../lib/api'
import type { ChartIn } from '../ui/DayChart'
import type { Moment } from './model'
import { replayInOf, todayCaps } from './storyIn'
import type { Replay } from './useReplay'

const m = (min: number, topic: Moment['topic'], txt: string): Moment => ({ min, topic, txt })

describe('the moments of today', () => {
  it('tells each at its place along the day, in the words the record has', () => {
    const got = todayCaps([m(60, 'sources', '01:00 · Hacker News starts sending people'), m(180, 'uptime', '03:00 · site down 4 min')], 240)
    expect(got.map((c) => [c.pos, c.at, c.line, c.kind])).toEqual([
      [0.25, '01:00', 'Hacker News starts sending people', 'source'],
      [0.75, '03:00', 'site down 4 min', 'down'],
    ])
  })
  it('has no moment for a day not yet begun, nor for one that names no topic', () => {
    expect(todayCaps([m(10, 'sources', '00:10 · x')], 0)).toEqual([])
    expect(todayCaps([m(60, null, '01:00 · a source nobody sent')], 120)).toEqual([])
  })
  it('never puts a moment past the end of the line', () => {
    expect(todayCaps([m(300, 'sales', '05:00 · first sale · $9')], 240)[0].pos).toBe(1)
  })
})

describe('what the replay is given', () => {
  const series = (v: number[]): Point[] => v.map((visitors, i) => ({ t: `2026-10-1${i}T00:00`, visitors, pageviews: visitors }))
  const base = { replay: {} as Replay, site: { id: 's' } as never, query: {} as never, bucket: 'day' as const, chart: {} as ChartIn, today: false, end: 0, clock: '', moments: [], period: 'Last 7 days', onShare: () => undefined }
  it('is nothing without people, or without a line to draw', () => {
    expect(replayInOf({ ...base, series: series([0, 0, 0, 0]), total: 0 })).toBeNull()
    expect(replayInOf({ ...base, series: series([3, 4]), total: 7 })).toBeNull()
  })
  it('is nothing for a day with less than an hour behind it', () => {
    expect(replayInOf({ ...base, series: series([1, 2, 3]), total: 6, today: true, end: 30 })).toBeNull()
  })
  it('tells only what the numbers hold: no source, no sale, when none was given', () => {
    const got = replayInOf({ ...base, series: series([5, 6, 5, 6]), total: 12 })
    expect(got?.base.map((c) => c.kind)).toEqual(['best'])
    expect(got?.total).toBe(12)
  })
})
