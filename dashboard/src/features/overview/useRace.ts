// While Replay tells the period, the page races: the tiles count every
// bucket up to the one playing, and the lists add up their rows so leaders
// overtake each other as the period unfolds. The arithmetic is in
// replayEngine, fetched when a replay starts (replayLoad); until it has
// arrived the page shows the period as it is.
import { useMemo } from 'react'
import { reducedMotion } from '../../lib/motion'
import type { KPIs, Point, Result, Row } from '../../lib/api'
import { useReplayEngine } from './replayLoad'

/** Fewer than half a visitor, half a pageview and half a cent so far: nothing to show. */
export const nothingYet = (r: { kpis: KPIs; revenue: number } | null) => !!r && r.kpis.visitors < 0.5 && r.kpis.pageviews < 0.5 && r.revenue < 0.5

interface Now {
  src: Result | undefined
  dates: string[]
  hourSeries: Point[]
  hours: boolean
  hourAt: number | null
  idx: number
  telling: boolean
  racing: boolean
  playing: boolean
}

/** The tiles at the point on screen (`raced`, for the page), and `follow`,
 *  which makes a tile's number a function of the playhead's position while
 *  it plays: between two points, frame by frame. */
export function useRaceNow(a: Now) {
  const engine = useReplayEngine(a.telling)
  const key = a.dates.join(',')
  // Only while Replay tells the period: nothing else reads the race.
  const day = useMemo(() => (engine && a.telling && !a.hours ? engine.dayRace(a.src, key ? key.split(',') : []) : null), [engine, a.telling, a.hours, a.src, key])
  const hour = useMemo(() => (engine && a.telling && a.hours ? engine.hourRace(a.hourSeries, a.src?.kpis) : null), [engine, a.telling, a.hours, a.hourSeries, a.src?.kpis])
  const race = a.hours ? hour : day
  const i = a.hours ? (a.hourAt ?? -1) : a.idx
  const raced = a.telling && race && (a.hours || a.racing) && i >= 0 ? race(i) : null
  const smooth = a.playing && a.telling && !reducedMotion() ? race : null
  const follow = (f: (r: NonNullable<typeof raced>) => number) => (smooth ? (pos: number) => f(smooth(pos)) : undefined)
  // Nothing has happened yet: the tiles say so with a dash, as before a first visit, not with 0, 0% and 0s.
  const blank = (pos: number) => nothingYet(smooth ? smooth(pos) : raced)
  return { raced, follow, blank }
}

const NONE: Record<string, Row[]> = {}

/** The lists so far: each row summed up to raceTo, landing on its period figure. */
export function useRaceRows(src: Result | undefined, raceTo: number) {
  const engine = useReplayEngine(raceTo >= 0)
  return useMemo(() => (engine && raceTo >= 0 ? engine.raceRows(src, raceTo) : NONE), [engine, src, raceTo])
}
