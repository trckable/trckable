// What Live shows, worked out from the server's last half hour and the people on the site: the bars, the sources split,
// how Today stands against its usual, the pages and the countries. Pure: live.test.ts.
import { countryName } from '../../lib/format'
import type { LiveNow } from '../../features/live/api'
import type { Row } from '../../features/live/model'

/** The 30 minutes as bars: each a share of the tallest, never under 3%, and flagged when nothing came. */
export function barsOf(minutes: number[]): { h: number; z: boolean }[] {
  // A quiet half hour stays small: one visit is a short bar, not a full-height one.
  const mx = Math.max(4, ...minutes)
  return minutes.map((b) => ({ h: Math.max(3, (b / mx) * 100), z: b === 0 }))
}

/** The last half hour against the one before it: a signed whole percent, or nothing when there was too little before. */
export function changeOf(now: number, before: number): { up: boolean; pct: number } | null {
  if (!(before > 3)) return null
  const d = (now - before) / before
  return { up: d >= 0, pct: Math.round(Math.abs(d) * 100) }
}

export interface Part {
  channel: string
  grow: number
  pct: number
  /** Visitors from this source. */
  n: number
}

/** The sources bar: the top five that are over 1% each, and the rest as one grey part. */
export function sourceParts(sources: LiveNow['sources']): { parts: Part[]; other: number } {
  const total = sources.reduce((n, s) => n + s.visitors, 0)
  if (!total) return { parts: [], other: 0 }
  const all = sources.map((s) => ({ channel: s.channel, grow: s.visitors / total, pct: Math.round((s.visitors / total) * 100), n: s.visitors })).filter((s) => s.grow > 0.01)
  const parts = all.slice(0, 5)
  return { parts, other: Math.max(0, 1 - parts.reduce((n, p) => n + p.grow, 0)) }
}

function wordOf(v: number, lo: number, hi: number): 'above' | 'below' | 'usual' {
  if (v > hi) return 'above'
  return v < lo ? 'below' : 'usual'
}

/** "Today" against what the same time last week brought: the verdict word and the band the dot sits on. */
export function todayBand(visitors: number, before: number, compare: boolean): { word: 'above' | 'below' | 'usual'; lo: number; hi: number; max: number } | null {
  if (!compare || !(before > 0)) return null
  const lo = Math.floor(before * 0.8)
  const hi = Math.ceil(before * 1.2)
  const word = wordOf(visitors, lo, hi)
  return { word, lo, hi, max: Math.max(visitors, hi, 1) * 1.25 }
}

/** A position on the bar, as a percent of its width (never at the very ends). */
export const place = (x: number, max: number): number => Math.max(2, Math.min(98, (x / (max || 1)) * 100))

/** The most common values, five at most: the most people first, ties in the order they first appear. */
function topFive(values: (string | undefined)[]): [string, number][] {
  const counts = new Map<string, number>()
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 5)
}

/** Phone against computer, as shares of the people whose device is known (a tablet counts with the phone). */
export function deviceSplit(rows: Row[]): { phone: number; computer: number } | null {
  const known = rows.filter((r) => r.device === 'mobile' || r.device === 'tablet' || r.device === 'desktop')
  if (!known.length) return null
  const phone = known.filter((r) => r.device !== 'desktop').length / known.length
  return { phone, computer: 1 - phone }
}

export function listsOf(rows: Row[]) {
  return {
    pages: topFive(rows.map((r) => r.path)).map(([label, n]) => ({ label, n })),
    countries: topFive(rows.map((r) => r.country?.toUpperCase())).map(([key, n]) => ({ label: countryName(key), key, n })),
    devices: deviceSplit(rows),
  }
}

/** The half hour's visitors, never fewer than who is online: online counts anyone active in five minutes, so it cannot be the larger. */
export const visitors30 = (visitors: number, online: number | null): number => Math.max(visitors, online ?? 0)
