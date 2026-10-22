// The globe's arithmetic, apart from drawing so it can be tested: where a visitor's pin sits, how pins group, how a
// point on the sphere reaches the screen. The server stores a country and a city name for a visit, never coordinates, so
// a pin sits at its country's middle point moved a small, stable step by its city's name: two cities of one country
// do not stack, and the same city always lands on the same spot. Nothing here is a precise location.
import type { Row } from '../../../features/live/model'
import { PLACES } from './globeData'

const RAD = Math.PI / 180

export interface Pin {
  /** The visitor's row key: one pin each. */
  key: string
  cc: string
  city: string
  /** Their newest page or event. */
  path: string
  lat: number
  lon: number
  /** Their last activity, unix ms. */
  last: number
  /** Changes whenever they move on or act: the pulse keys on it. */
  sig: string
  /** Their place in a unit disc around the spot, and how many share it: zoomed in, the pins spread by it on the screen. */
  ux: number
  uy: number
  crowd: number
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

const GOLDEN = 2.399963229728653
/** The widest a crowd at one spot spreads, in degrees. */
const SPREAD_MAX = 2.4

/** Where one visitor sits around their spot: a golden-angle spiral position fixed by their id, wider as more share the spot (never past SPREAD_MAX). */
export function spreadOf(id: string, crowd: number): [number, number] {
  const i = Math.floor(hash(id) * 997)
  const reach = Math.min(SPREAD_MAX, 0.5 + 0.3 * Math.sqrt(crowd))
  const r = crowd > 1 ? reach * Math.sqrt(((i % 61) + 1) / 61) : 0
  return [Math.sin(i * GOLDEN) * r, Math.cos(i * GOLDEN) * r]
}

/** The unit-disc place of an id (the same spiral, before it is scaled to a distance). */
export function unitOf(id: string): [number, number] {
  const i = Math.floor(hash(id) * 997)
  const k = Math.sqrt(((i % 61) + 1) / 61)
  return [Math.sin(i * GOLDEN) * k, Math.cos(i * GOLDEN) * k]
}

const what = (r: Row): string => (r.kind === 'goal' ? r.label || r.goal || '' : (r.path ?? '/'))

/** The spot a visit belongs to: its country and city. */
export const spotOf = (r: Pick<Row, 'country' | 'city'>): string => `${r.country?.toUpperCase() ?? ''}/${r.city ?? ''}`

/** The people on the site, as pins: one each, the same people the "On the site now" list holds. Rows are newest first. */
export function pinsOf(rows: readonly Row[]): Pin[] {
  const crowd = new Map<string, number>()
  for (const r of rows) crowd.set(spotOf(r), (crowd.get(spotOf(r)) ?? 0) + 1)
  const out: Pin[] = []
  for (const r of rows) {
    const cc = r.country?.toUpperCase() ?? ''
    const at = placeOf(cc, r.city ?? '')
    if (!at) continue
    const n = crowd.get(spotOf(r)) ?? 1
    const [dy, dx] = spreadOf(r.key, n)
    const [ux, uy] = unitOf(r.key)
    out.push({ key: r.key, cc, city: r.city ?? '', path: what(r), lat: Math.max(-80, Math.min(80, at[0] + dy)), lon: at[1] + dx / Math.max(0.3, Math.cos(at[0] * RAD)), last: r.last, sig: `${r.key}@${r.last}`, ux, uy, crowd: n })
  }
  return out
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
