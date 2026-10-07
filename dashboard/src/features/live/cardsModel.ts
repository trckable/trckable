// What the three cards under Live show, worked out from what Live already
// holds: the people on the site now (their pages, countries, devices) and the
// server's "today so far". Pure, so it can be tested.
import type { Row } from './model'

/** Within this share of last week a change is not worth a colour. */
export const FLAT = 0.02

export type Move = { dir: 'up' | 'down' | 'flat'; pct: number }

/** Today against last week's same time; null when there is nothing to compare with. */
export function moveOf(now: number, before: number | undefined, compare = true): Move | null {
  if (!compare || before === undefined || !(before > 0)) return null
  const d = Math.round(((now - before) / before) * 1e6) / 1e6
  if (Math.abs(d) <= FLAT) return { dir: 'flat', pct: Math.round(Math.abs(d) * 100) }
  return { dir: d > 0 ? 'up' : 'down', pct: Math.round(Math.abs(d) * 100) }
}

export type Count = { key: string; n: number }

function tally(keys: readonly string[]): Count[] {
  const m = new Map<string, number>()
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1)
  return [...m].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n || (a.key < b.key ? -1 : 1))
}

/** The pages people are on now, most people first. */
export function topPages(rows: readonly Row[], top = 3): Count[] {
  return tally(rows.filter((r) => r.kind === 'pageview' && r.path).map((r) => r.path as string)).slice(0, top)
}

export type Places = {
  total: number
  top: { code: string; share: number }
  parts: (Count & { share: number })[]
  mobile: number // shares of the people whose device is known, 0 to 1
  desktop: number
}

/** The countries of the people on the site, and how many use a phone or a computer; null when no one has a country. */
export function placesOf(rows: readonly Row[], top = 3): Places | null {
  const counts = tally(rows.filter((r) => r.country).map((r) => (r.country as string).toUpperCase()))
  const total = counts.reduce((n, c) => n + c.n, 0)
  if (!total) return null
  const parts = counts.slice(0, top).map((c) => ({ ...c, share: c.n / total }))
  const devices = rows.map((r) => (r.device ?? '').toLowerCase()).filter(Boolean)
  const phones = devices.filter((d) => d === 'mobile' || d === 'phone').length
  const desks = devices.filter((d) => d === 'desktop').length
  return {
    total,
    top: { code: parts[0].key, share: parts[0].share },
    parts,
    mobile: devices.length ? phones / devices.length : 0,
    desktop: devices.length ? desks / devices.length : 0,
  }
}

/** A line's points in a w × h box, its own top or the shared `max`: "x,y x,y …". */
export function linePoints(values: readonly number[], max: number, w: number, h: number, steps = values.length - 1): string {
  if (values.length < 2 || steps < 1) return ''
  const top = Math.max(max, 1)
  return values.map((v, i) => `${((i / steps) * w).toFixed(1)},${(h - (v / top) * (h - 3) - 1.5).toFixed(1)}`).join(' ')
}
