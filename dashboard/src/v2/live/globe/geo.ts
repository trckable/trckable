// The globe's arithmetic, apart from drawing so it can be tested: where a visitor's pin sits and how pins group into the
// markers the globe draws. The server stores a country and a city name for a visit, never coordinates, so a pin sits at
// its country's middle point moved a small, stable step by its city's name: two cities of one country do not stack, and
// the same city always lands on the same spot. Nothing here is a precise location.
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
  /** How many people are at the same spot (their country, or their city of it). */
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
    out.push({ key: r.key, cc, city: r.city ?? '', path: what(r), lat: at[0], lon: at[1], last: r.last, sig: `${r.key}@${r.last}`, crowd: n })
  }
  return out
}

export const wrap = (lon: number): number => ((((lon + 180) % 360) + 360) % 360) - 180

/** "15s ago", "3m ago": the clock in short words. */
export function agoOf(ms: number): { unit: 's' | 'm'; n: number } {
  const s = Math.max(0, Math.floor(ms / 1000))
  return s < 60 ? { unit: 's', n: s } : { unit: 'm', n: Math.floor(s / 60) }
}

/** The pins grouped by spot, each with its newest pin (a tap on the spot opens that visitor) and everyone's key. */
export function spotsOf(pins: readonly Pin[]): Map<string, { lead: Pin; members: string[] }> {
  const out = new Map<string, { lead: Pin; members: string[] }>()
  for (const p of pins) {
    const k = `${p.cc}/${p.city}`
    const g = out.get(k)
    if (!g) out.set(k, { lead: p, members: [p.key] })
    else {
      g.members.push(p.key)
      if (p.last > g.lead.last) g.lead = p
    }
  }
  return out
}
