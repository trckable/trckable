// While Replay tells the period, the page races: the tiles count every
// bucket up to the one playing, and the lists add up their rows so leaders
// overtake each other as the period unfolds.
import { useMemo } from 'react'
import { reducedMotion } from '../../lib/motion'
import type { KPIs, Point, Result, Row } from '../../lib/api'

export const RACE_DIMS = ['channel', 'entry_page', 'country', 'device']

/** What one bucket adds to the tiles. */
export interface Part { visitors: number; sessions: number; pageviews: number; bounced: number; secs: number; fresh: number; revenue: number }
const KEYS: (keyof Part)[] = ['visitors', 'sessions', 'pageviews', 'bounced', 'secs', 'fresh', 'revenue']

/** The tiles so far, at a position between the chart's points: 2 is the
 *  third point's day done, 2.5 is half of the fourth added on top. Sums are
 *  prefix sums, so a frame costs a few additions. Given `whole`, only
 *  visitors and pageviews race (by the hour) and the rest keep its figures. */
export function raceAt(parts: Part[], scale: number, whole?: KPIs) {
  const cum = parts.map(() => ({}) as Record<keyof Part, number>)
  const run = {} as Record<keyof Part, number>
  KEYS.forEach((k) => (run[k] = 0))
  parts.forEach((x, i) => KEYS.forEach((k) => (cum[i][k] = run[k] += x[k])))
  return (pos: number): { kpis: KPIs; revenue: number } => {
    const top = parts.length - 1
    const at = Math.max(0, Math.min(top, pos))
    const i = Math.floor(at)
    const f = at - i
    const v = {} as Record<keyof Part, number>
    for (const k of KEYS) v[k] = cum[i][k] + f * ((cum[Math.min(top, i + 1)]?.[k] ?? cum[i][k]) - cum[i][k])
    const visitors = v.visitors * scale
    if (whole) return { kpis: { ...whole, visitors, pageviews: v.pageviews }, revenue: v.revenue }
    // Someone who came on two days is two daily visitors but one visitor of
    // the period, so the days add up to more than the period. Scaled by that
    // ratio, the count climbs to the period's own figure and stops there,
    // instead of overshooting and dropping back when the replay ends.
    return {
      kpis: {
        visitors,
        sessions: v.sessions,
        pageviews: v.pageviews,
        bounce_rate: v.sessions ? v.bounced / v.sessions : 0,
        avg_session_s: v.sessions ? v.secs / v.sessions : 0,
        views_per_session: v.sessions ? v.pageviews / v.sessions : 0,
        new_visitor_share: visitors ? v.fresh / visitors : 0,
      },
      revenue: v.revenue,
    }
  }
}

/** The tiles by day: one part per chart point (the days skip empty ones, so
 *  they are matched by date). */
export function useDayRace(src: Result | undefined, dates: string[]) {
  const key = dates.join(',')
  return useMemo(() => {
    const days = src?.days
    if (!days || !key) return null
    const by = new Map(days.map((d) => [d.date, d]))
    const parts: Part[] = key.split(',').map((date) => {
      const d = by.get(date)
      const x = d?.kpis
      return {
        visitors: x?.visitors ?? 0,
        sessions: x?.sessions ?? 0,
        pageviews: x?.pageviews ?? 0,
        bounced: x ? x.bounce_rate * x.sessions : 0,
        secs: x ? x.avg_session_s * x.sessions : 0,
        fresh: x ? x.new_visitor_share * x.visitors : 0,
        revenue: d?.money?.revenue ?? 0,
      }
    })
    const all = parts.reduce((a, x) => a + x.visitors, 0)
    return raceAt(parts, all && src?.kpis ? src.kpis.visitors / all : 1)
  }, [src, key])
}

/** By the hour: visitors, pageviews and revenue so far, from the hourly line. */
export function useHourRace(series: Point[], whole: KPIs | undefined) {
  return useMemo(() => {
    if (!whole || !series.length) return null
    const parts: Part[] = series.map((p) => ({ visitors: p.visitors, sessions: 0, pageviews: p.pageviews, bounced: 0, secs: 0, fresh: 0, revenue: p.revenue ?? 0 }))
    const all = parts.reduce((a, x) => a + x.visitors, 0)
    return raceAt(parts, all ? whole.visitors / all : 1, whole)
  }, [series, whole])
}

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
  const day = useDayRace(a.src, a.dates)
  const hour = useHourRace(a.hourSeries, a.src?.kpis)
  const race = a.hours ? hour : day
  const i = a.hours ? (a.hourAt ?? -1) : a.idx
  const raced = a.telling && race && (a.hours || a.racing) && i >= 0 ? race(i) : null
  const smooth = a.playing && a.telling && !reducedMotion() ? race : null
  const follow = (f: (r: NonNullable<typeof raced>) => number) => (smooth ? (pos: number) => f(smooth(pos)) : undefined)
  // Nothing has happened yet: the tiles say so with a dash, as before a first visit, not with 0, 0% and 0s.
  const blank = (pos: number) => nothingYet(smooth ? smooth(pos) : raced)
  return { raced, follow, blank }
}

/** The lists so far: each row summed up to raceTo, landing on its period figure. */
export function useRaceRows(src: Result | undefined, raceTo: number) {
  return useMemo(() => {
    const out: Record<string, Row[]> = {}
    const days = src?.days
    if (raceTo < 0 || !days) return out
    // The days skip empty ones: the playhead's day is matched by date.
    const cutoff = src?.series[raceTo]?.t.slice(0, 10) ?? ''
    for (const dim of RACE_DIMS) {
      // Days keep visitors only; a bounce rate would have to be invented.
      const sum = new Map<string, number>()
      const all = new Map<string, number>()
      days.forEach((d) => {
        for (const r of d.dims?.[dim] ?? []) {
          all.set(r.value, (all.get(r.value) ?? 0) + r.visitors)
          if (d.date <= cutoff) sum.set(r.value, (sum.get(r.value) ?? 0) + r.visitors)
        }
      })
      const period = new Map((src?.dims?.[dim] ?? []).map((r) => [r.value, r.visitors]))
      out[dim] = [...sum]
        .map(([value, n]) => {
          const whole = period.get(value), summed = all.get(value)
          return { value, visitors: Math.round(whole !== undefined && summed ? (n * whole) / summed : n) }
        })
        .sort((a, b) => b.visitors - a.visitors || a.value.localeCompare(b.value))
    }
    return out
  }, [src, raceTo])
}
