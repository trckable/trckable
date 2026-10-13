// What the incident record says, as plain functions: how long, which day, how
// the days of a period are coloured, how much of it was uptime. Nothing here
// knows about the browser, so the page, the chart's markers and All sites read
// it the same way.
import type { Incident } from './api'

const DAY = 86400

/** Seconds as people say a span: 45m, 3h 12m, 2d 4h. */
export function duration(secs: number): string {
  const s = Math.max(0, Math.round(secs))
  if (s < 60) return '<1m'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`
  const d = Math.floor(h / 24)
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`
}

const zones = new Map<string, Intl.DateTimeFormat>()

/** The calendar day (YYYY-MM-DD) of a moment in a time zone. */
export function dayIn(unix: number, tz: string): string {
  let f = zones.get(tz)
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    } catch {
      f = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' })
    }
    zones.set(tz, f)
  }
  return f.format(new Date(unix * 1000))
}

export type DayState = 'ok' | 'quiet' | 'down'

/** How long it lasted; an open one lasts until now. */
export const lasted = (x: Incident, now: number): number => (x.ended_at ?? now) - x.started_at

/** The days of a period (YYYY-MM-DD, oldest first), each coloured by the worst incident that touched it: down over quiet over none. */
export function dayStates(list: Incident[], days: string[], tz: string, now: number): Map<string, DayState> {
  const out = new Map<string, DayState>(days.map((d) => [d, 'ok']))
  for (const x of list) {
    const first = dayIn(x.started_at, tz)
    const last = dayIn(x.ended_at ?? now, tz)
    for (const d of days) {
      if (d < first || d > last) continue
      if (x.kind === 'down' || out.get(d) === 'ok') out.set(d, x.kind)
    }
  }
  return out
}

/** The share of a period (seconds) not spent in an incident, to one decimal, never 100 while any of it was lost. */
export function uptimePct(period: number, affected: number): number {
  if (period <= 0) return 100
  const pct = (1 - Math.min(affected, period) / period) * 100
  const r = Math.round(pct * 10) / 10
  return affected > 0 && r >= 100 ? 99.9 : r
}

/** Time spent in incidents inside [from, to]; overlapping ones are counted once. */
export function affectedSeconds(list: Incident[], from: number, to: number, now: number): number {
  const spans = list
    .map((x) => [Math.max(x.started_at, from), Math.min(x.ended_at ?? now, to)] as const)
    .filter(([a, b]) => b > a)
    .sort((p, q) => p[0] - q[0])
  let total = 0
  let end = -Infinity
  for (const [a, b] of spans) {
    total += b - Math.max(a, end)
    end = Math.max(end, b)
  }
  return total
}

/** The days from `from` to `to`, oldest first. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let t = Date.parse(from + 'T00:00:00Z'); t <= Date.parse(to + 'T00:00:00Z') && out.length < 400; t += DAY * 1000) out.push(new Date(t).toISOString().slice(0, 10))
  return out
}

/** The start of a day in a time zone, as unix seconds. */
export function startOfDay(day: string, tz: string): number {
  const utc = Date.parse(day + 'T00:00:00Z') / 1000
  let offset = 0
  try {
    // What the clock reads in the zone at that moment, taken as if it were UTC, is the zone's offset from it.
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    const p = Object.fromEntries(f.formatToParts(new Date(utc * 1000)).map((x) => [x.type, x.value]))
    offset = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`) / 1000 - utc
  } catch {
    // an unknown zone reads as UTC
  }
  return utc - offset
}

/** The incident figure for a whole All sites row: its totals over `days` days. */
export function rowTotals(list: Incident[], days: number, now: number): { count: number; seconds: number; pct: number } {
  const from = now - days * DAY
  const mine = list.filter((x) => (x.ended_at ?? now) > from)
  const seconds = affectedSeconds(mine, from, now, now)
  return { count: mine.length, seconds, pct: uptimePct(days * DAY, seconds) }
}

/** A site that has had no visit for the whole period: its incident is still open and began before it. Its uptime says nothing worth a number. */
export const silentAllPeriod = (list: Incident[], from: number): boolean => list.some((x) => x.ended_at === null && x.started_at < from)
