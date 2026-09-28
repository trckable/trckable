// While Replay tells the period, the page races: the tiles count every
// bucket up to the one playing, and the lists add up their rows so leaders
// overtake each other as the period unfolds.
import { useMemo } from 'react'
import type { KPIs, Point, Result, Row } from '../../lib/api'

export const RACE_DIMS = ['channel', 'entry_page', 'country', 'device']

/** The tiles so far: every day up to raceTo, landing on the period's own figures. */
export function useRaceKpis(src: Result | undefined, raceTo: number) {
  return useMemo(() => {
    const days = src?.days
    if (raceTo < 0 || !days) return null
    let visitors = 0, sessions = 0, pageviews = 0, bounced = 0, secs = 0, fresh = 0, revenue = 0
    for (const d of days.slice(0, raceTo + 1)) {
      const x = d.kpis
      visitors += x.visitors
      sessions += x.sessions
      pageviews += x.pageviews
      bounced += x.bounce_rate * x.sessions
      secs += x.avg_session_s * x.sessions
      fresh += x.new_visitor_share * x.visitors
      revenue += d.money?.revenue ?? 0
    }
    // Someone who came on two days is two daily visitors but one visitor of
    // the period, so the days add up to more than the period. Scaled by that
    // ratio, the count climbs to the period's own figure and stops there,
    // instead of overshooting and dropping back when the replay ends.
    const allVisitors = days.reduce((a, d) => a + d.kpis.visitors, 0)
    if (allVisitors && src?.kpis) visitors *= src.kpis.visitors / allVisitors
    const kpis: KPIs = {
      visitors, sessions, pageviews,
      bounce_rate: sessions ? bounced / sessions : 0,
      avg_session_s: sessions ? secs / sessions : 0,
      views_per_session: sessions ? pageviews / sessions : 0,
      new_visitor_share: visitors ? fresh / visitors : 0,
    }
    return { kpis, revenue }
  }, [src, raceTo])
}

/** By the hour: visitors, pageviews and revenue so far, from the hourly
 *  line; the rest of the tiles keep the period's figures. */
export function useHourRace(series: Point[], at: number | null, whole: KPIs | undefined) {
  return useMemo(() => {
    if (at == null || at < 0 || !whole) return null
    let visitors = 0, pageviews = 0, revenue = 0, all = 0
    series.forEach((p, i) => {
      all += p.visitors
      if (i > at) return
      visitors += p.visitors
      pageviews += p.pageviews
      revenue += p.revenue ?? 0
    })
    if (all) visitors *= whole.visitors / all
    return { kpis: { ...whole, visitors, pageviews }, revenue }
  }, [series, at, whole])
}

/** The lists so far: each row summed up to raceTo, landing on its period figure. */
export function useRaceRows(src: Result | undefined, raceTo: number) {
  return useMemo(() => {
    const out: Record<string, Row[]> = {}
    const days = src?.days
    if (raceTo < 0 || !days) return out
    for (const dim of RACE_DIMS) {
      // Days keep visitors only; a bounce rate would have to be invented.
      const sum = new Map<string, number>()
      const all = new Map<string, number>()
      days.forEach((d, i) => {
        for (const r of d.dims?.[dim] ?? []) {
          all.set(r.value, (all.get(r.value) ?? 0) + r.visitors)
          if (i <= raceTo) sum.set(r.value, (sum.get(r.value) ?? 0) + r.visitors)
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
