// What a replay needs only once it plays: the clock that moves the playhead
// and the arithmetic that makes the tiles and lists race to the period's
// totals. One lazy chunk, fetched when Replay starts (replayLoad.ts); the page
// loads without it.
import type { KPIs, Point, Result, Row } from '../../lib/api'
import { playhead } from './playhead'
import { RACE_DIMS } from './replayTime'

/** Points per millisecond: the whole path, first to last point, in `secs`. */
export function rateOf(first: number, n: number, secs: number): number {
  return Math.max(0, n - 1 - first) / (secs * 1000)
}

/** The playhead after dt milliseconds. A new speed changes the rate only, so
 *  the position carries on from where it is. */
export function advance(pos: number, dt: number, rate: number, last: number): number {
  return Math.min(last, pos + Math.max(0, Math.min(dt, 250)) * rate)
}

/** The point to hand to the page (its lists, cards and address) now, or null.
 *  Every point in passing is throttled to one per minMs. */
export function commitAt(pos: number, committed: number, sinceMs: number, minMs: number): number | null {
  const idx = Math.floor(pos + 1e-9)
  if (idx <= committed) return null
  return sinceMs >= minMs ? idx : null
}

/** The point a replay starts on: where it was paused, else the chart's first. */
export function replayStart(first: number, at: number, n: number) {
  return at < first || at >= n - 1 ? first : at
}

/** The points a replay visits: every one from start. */
export function replayPath(start: number, n: number): number[] {
  return Array.from({ length: Math.max(0, n - start) }, (_, k) => start + k)
}

export type Run = { playing: boolean; secs: number; first: number; n: number; at: number; step: (i: number | null) => void; done: () => void }

const COMMIT_MS = 220 // how often the page's lists and cards move on a point
const HOLD_MS = 450 // the line stays complete a moment before the summary

// A replay is a race to the period's totals, so it finishes on them: after
// the last point, step(null) puts the whole period back. `live` holds the
// latest run: the clock reads it every frame, so a new speed changes the pace
// and nothing else, and the playhead carries on from where it is. Returns
// what stops the clock.
export function runClock(live: { current: Run }): () => void {
  const { first, n, at } = live.current
  const start = replayStart(first, at, n)
  // Reduced motion steps point to point, a pause on each, no glide.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const path = replayPath(start, n)
    const every = Math.max(120, (live.current.secs * 1000) / path.length)
    let k = 0
    live.current.step(path[0])
    const t = setInterval(() => {
      k++
      if (k >= path.length) {
        clearInterval(t)
        live.current.done()
        live.current.step(null)
        return
      }
      live.current.step(path[k])
    }, every)
    return () => clearInterval(t)
  }
  let pos = start
  let committed = start
  let prev = performance.now()
  let lastCommit = prev
  let raf = 0
  let hold: ReturnType<typeof setTimeout> | undefined
  live.current.step(start)
  playhead.set(pos - first)
  const frame = (now: number) => {
    const r = live.current
    pos = advance(pos, now - prev, rateOf(first, n, r.secs), n - 1)
    prev = now
    playhead.set(pos - first)
    const c = commitAt(pos, committed, now - lastCommit, COMMIT_MS)
    if (c !== null) {
      committed = c
      lastCommit = now
      r.step(c)
    }
    if (pos < n - 1) {
      raf = requestAnimationFrame(frame)
      return
    }
    if (committed < n - 1) r.step(n - 1)
    hold = setTimeout(() => {
      live.current.done()
      live.current.step(null)
    }, HOLD_MS)
  }
  raf = requestAnimationFrame(frame)
  return () => {
    cancelAnimationFrame(raf)
    clearTimeout(hold)
  }
}

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
export function dayRace(src: Result | undefined, dates: string[]) {
  const days = src?.days
  if (!days || !dates.length) return null
  const by = new Map(days.map((d) => [d.date, d]))
  const parts: Part[] = dates.map((date) => {
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
}

/** By the hour: visitors, pageviews and revenue so far, from the hourly line. */
export function hourRace(series: Point[], whole: KPIs | undefined) {
  if (!whole || !series.length) return null
  const parts: Part[] = series.map((p) => ({ visitors: p.visitors, sessions: 0, pageviews: p.pageviews, bounced: 0, secs: 0, fresh: 0, revenue: p.revenue ?? 0 }))
  const all = parts.reduce((a, x) => a + x.visitors, 0)
  return raceAt(parts, all ? whole.visitors / all : 1, whole)
}

/** The lists so far: each row summed up to raceTo, landing on its period figure. */
export function raceRows(src: Result | undefined, raceTo: number) {
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
}
