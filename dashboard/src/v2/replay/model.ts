// Replay of the day: the moments worth stopping at, and the report as it stood at a time of day. Pure: model.test.ts.
import type { Point, Result } from '../../lib/api'

export type Topic = 'sources' | 'mentions' | 'uptime' | 'sales'

export interface Moment {
  /** Minutes into the day. */
  min: number
  topic: Topic | null
  /** "14:10 · Hacker News starts sending people". */
  txt: string
}

const hm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

export interface MomentsIn {
  /** Minutes of the day that have passed. */
  until: number
  /** The source that rose, and its people hour by hour (the first hour it carried a crowd is when it started sending them). */
  source?: { name: string; hourly: number[] }
  /** A mention found today, as minutes into the day. */
  mention?: { host: string; min: number }
  /** Outages begun today: minutes into the day, and how long (null while it goes on). */
  downs: { min: number; len: number | null }[]
  /** The first sales of the day (minutes in the day, amount already written). */
  sales: { min: number; amount: string; kind: 'first' | 'upgrade' | 'renewal' | 'more' }[]
  words: {
    starts: (name: string) => string
    mention: (host: string) => string
    down: (min: number, ongoing: boolean) => string
    sale: (kind: 'first' | 'upgrade' | 'renewal' | 'more', amount: string) => string
  }
}

/** When a source began to send a crowd: the first hour that carried a third of its busiest hour (and at least five people). */
export function startOf(hourly: number[]): number | null {
  const peak = Math.max(0, ...hourly)
  if (peak < 5) return null
  const h = hourly.findIndex((v) => v >= peak / 3 && v >= 5)
  return h < 0 ? null : h * 60
}

export function momentsOf(o: MomentsIn): Moment[] {
  const out: Moment[] = []
  const at = o.source ? startOf(o.source.hourly) : null
  if (o.source && at !== null && at <= o.until) out.push({ min: at, topic: 'sources', txt: `${hm(at)} · ${o.words.starts(o.source.name)}` })
  if (o.mention && o.mention.min <= o.until) out.push({ min: o.mention.min, topic: 'mentions', txt: `${hm(o.mention.min)} · ${o.words.mention(o.mention.host)}` })
  for (const d of o.downs) {
    if (d.min > o.until) continue
    const len = Math.max(1, Math.round(Math.min(d.len ?? o.until - d.min, o.until - d.min)))
    out.push({ min: d.min, topic: 'uptime', txt: `${hm(d.min)} · ${o.words.down(len, d.len === null || d.min + d.len > o.until)}` })
  }
  for (const s of o.sales.slice(0, 3)) if (s.min <= o.until) out.push({ min: s.min, topic: 'sales', txt: `${hm(s.min)} · ${o.words.sale(s.kind, s.amount)}` })
  // Moments too close to the one before are folded into it, so the story never stutters.
  return out.sort((a, b) => a.min - b.min).filter((m, i, all) => !i || m.min - all[i - 1].min >= 3)
}

/** The report as it stood at `t` minutes into the day: hours not yet come hold nothing, the part-way hour part of its people. */
export function asOf(cur: Result, t: number): Result {
  const hour = Math.floor(t / 60)
  const part = (t % 60) / 60
  const series: Point[] = cur.series.map((p, i) => {
    const day = i < 24 ? i : -1
    if (day < 0 || day < hour) return p
    const k = day === hour ? part : 0
    return { ...p, visitors: Math.round(p.visitors * k), pageviews: Math.round(p.pageviews * k) }
  })
  const visitors = series.reduce((a, p) => a + p.visitors, 0)
  const pageviews = series.reduce((a, p) => a + p.pageviews, 0)
  const was = cur.kpis.visitors || 1
  return { ...cur, series, kpis: { ...cur.kpis, visitors, pageviews, sessions: Math.round((cur.kpis.sessions * visitors) / was) } }
}

/** One tick of the clock: how far the playhead moves in a tick and whether it waits on a moment. Twenty seconds for the whole day at normal speed. */
export const REPLAY_MS = 20000
export const TICK_MS = 45
export const step = (end: number, speed: number): number => (end / (REPLAY_MS / TICK_MS)) * speed
