// The globe's arithmetic, apart from drawing so it can be tested: where a visitor's pin sits, how pins group, how a
// point on the sphere reaches the screen. The server stores a country and a city name for a visit, never coordinates, so
// a pin sits at its country's middle point moved a small, stable step by its city's name: two cities of one country
// do not stack, and the same city always lands on the same spot. Nothing here is a precise location.
import type { Row } from '../../../features/live/model'
import { PLACES } from './globeData'

const RAD = Math.PI / 180

export interface Pin {
  /** The spot: country and city. */
  key: string
  cc: string
  city: string
  /** The newest page or event at the spot. */
  path: string
  /** People at the spot. */
  n: number
  lat: number
  lon: number
  /** The newest activity here, unix ms. */
  last: number
  /** Changes whenever someone arrives here: the pulse keys on it. */
  sig: string
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

/** A country's middle point moved up to about two degrees in a direction its city's name decides. No city: the middle itself. */
export function placeOf(cc: string, city: string): [number, number] | null {
  const c = PLACES[cc]
  if (!c) return null
  if (!city) return c
  const a = hash(city) * 2 * Math.PI
  const r = 0.4 + hash(city + '/') * 1.6
  return [Math.max(-80, Math.min(80, c[0] + Math.sin(a) * r)), c[1] + (Math.cos(a) * r) / Math.max(0.3, Math.cos(c[0] * RAD))]
}

const what = (r: Row): string => (r.kind === 'goal' ? r.label || r.goal || '' : (r.path ?? '/'))

/** The spot a visit belongs to: its pin's key. */
export const pinKeyOf = (r: Pick<Row, 'country' | 'city'>): string => `${r.country?.toUpperCase() ?? ''}/${r.city ?? ''}`

/** The people at one spot, newest first. */
export const rowsAt = (rows: readonly Row[], key: string): Row[] => rows.filter((r) => pinKeyOf(r) === key)

/** The people on the site, as pins: one per country and city, the same people the "On the site now" list holds. Rows are newest first. */
export function pinsOf(rows: readonly Row[]): Pin[] {
  const by = new Map<string, Pin>()
  for (const r of rows) {
    const cc = r.country?.toUpperCase() ?? ''
    const at = placeOf(cc, r.city ?? '')
    if (!at) continue
    const key = pinKeyOf(r)
    const p = by.get(key)
    if (p) {
      p.n++
      continue
    }
    by.set(key, { key, cc, city: r.city ?? '', path: what(r), n: 1, lat: at[0], lon: at[1], last: r.last, sig: `${key}@${r.last}` })
  }
  return [...by.values()]
}

export const wrap = (lon: number): number => ((((lon + 180) % 360) + 360) % 360) - 180

/** "15s ago", "3m ago": the clock in short words. */
export function agoOf(ms: number): { unit: 's' | 'm'; n: number } {
  const s = Math.max(0, Math.floor(ms / 1000))
  return s < 60 ? { unit: 's', n: s } : { unit: 'm', n: Math.floor(s / 60) }
}

/** Fewer dots on a small screen or a low-power device: every second dot is skipped (1 draws all). */
export function thinning(width: number, cores: number, memory: number): 1 | 2 {
  return width < 600 || cores <= 4 || memory <= 4 ? 2 : 1
}
