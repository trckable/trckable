// Live mode's logic, apart from React so it can be tested: the chart's
// minutes, who is on the site, the sources bar. The server's answer (/now) is
// the truth; visits from the stream that arrived after it are laid on top
// until the next answer, which already counts them.
import type { Visit } from '../../lib/api'
import type { LiveNow, NowVisit } from './api'

export const MINUTE = 60_000
/** Idle this long and a visitor has left: the five minutes Online counts. */
export const IDLE_MS = 5 * MINUTE
/** At most this many rows in the list of who is on the site. */
export const MAX_ROWS = 50

export type Series = { start: number; minutes: number[] }

/**
 * The server's minutes moved on to the minute `now` is in: whole minutes
 * that passed since it answered drop off the left, empty ones join on the
 * right. The window never moves back.
 */
export function shiftTo(s: Series, now: number): Series {
  const n = s.minutes.length
  const steps = Math.floor((now - s.start) / MINUTE) - (n - 1)
  if (steps <= 0 || n === 0) return s
  if (steps >= n) return { start: s.start + steps * MINUTE, minutes: new Array<number>(n).fill(0) }
  return { start: s.start + steps * MINUTE, minutes: [...s.minutes.slice(steps), ...new Array<number>(steps).fill(0)] }
}

/** Pageviews the stream brought after the answer (ts > at), in their minute. */
export function withVisits(s: Series, visits: readonly Visit[], at: number): Series {
  let minutes = s.minutes
  for (const v of visits) {
    if (v.kind !== 'pageview' || v.ts <= at) continue
    const i = Math.floor((v.ts - s.start) / MINUTE)
    if (i < 0 || i >= minutes.length) continue
    if (minutes === s.minutes) minutes = [...s.minutes]
    minutes[i]++
  }
  return minutes === s.minutes ? s : { start: s.start, minutes }
}

/** The chart's series at `now`: the answer, moved on, plus newer visits. */
export function seriesAt(now: LiveNow, visits: readonly Visit[], at: number): number[] {
  return withVisits(shiftTo({ start: now.start, minutes: now.minutes }, at), visits, now.at).minutes
}

export type Row = NowVisit & { key: string }

/** A row's identity: the visitor when journeys lets us know them; otherwise
 *  the visit itself, so a person moving on is a new row. */
export const keyOf = (v: Visit) => (v.visitor ? 'v:' + v.visitor : `t:${v.ts}:${v.kind}:${v.path ?? ''}:${v.goal ?? ''}`)

/**
 * Who is on the site at `now`: the server's list, with the stream's newer
 * visits on top (a known visitor moves up with their new page), and
 * everyone idle for five minutes gone. Newest activity first.
 */
export function feedOf(recent: readonly NowVisit[], visits: readonly Visit[], at: number, now: number): Row[] {
  const rows = recent.map((v) => ({ ...v, key: keyOf(v) }))
  // The stream's list is newest first: lay the oldest down first.
  for (let i = visits.length - 1; i >= 0; i--) {
    const v = visits[i]
    if (v.ts <= at) continue
    const row: Row = { ...v, last: v.ts, key: keyOf(v) }
    const was = rows.findIndex((r) => r.key === row.key)
    if (was >= 0) rows.splice(was, 1)
    rows.unshift(row)
  }
  return rows.filter((r) => now - r.last < IDLE_MS).slice(0, MAX_ROWS)
}

export type Share = { channel: string; visitors: number; share: number }

/** The split bar: the top channels, and the rest as one "other" part. */
export function sharesOf(sources: LiveNow['sources'], top = 3): { parts: Share[]; other: number } {
  const total = sources.reduce((n, s) => n + s.visitors, 0)
  if (!total) return { parts: [], other: 0 }
  const parts = sources.slice(0, top).map((s) => ({ ...s, share: s.visitors / total }))
  const rest = sources.slice(top).reduce((n, s) => n + s.visitors, 0)
  return { parts, other: rest / total }
}

/** Whole percent for a legend, never "0%" for a part that is there. */
export function pct(share: number): string {
  if (share > 0 && share < 0.01) return '<1%'
  return `${Math.round(share * 100)}%`
}
