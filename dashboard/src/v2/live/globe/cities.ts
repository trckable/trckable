// Where a visitor's city is, when we know the city: the server tells a country and a city name, never coordinates, so a pin finds its
// city in the globe's list (about 150 well-known ones). A name that is not on it, or one that is on it but far from the country it was
// told with (a different Santiago), is not found, and the pin stays at its country's middle (geo.ts).
import { PLACES } from './globeData'
import { CITIES } from './globeCities'

const RAD = Math.PI / 180
/** A name without accents, case or punctuation. */
export const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')

const byName = new Map<string, [number, number][]>()
for (const [name, lat, lon] of CITIES) {
  const k = fold(name)
  const at = byName.get(k)
  if (at) at.push([lat, lon])
  else byName.set(k, [[lat, lon]])
}

/** The angle between two places, in degrees. */
function apart(a: [number, number], b: [number, number]): number {
  const c = Math.sin(a[0] * RAD) * Math.sin(b[0] * RAD) + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.cos((a[1] - b[1]) * RAD)
  return Math.acos(Math.max(-1, Math.min(1, c))) / RAD
}

/** The listed city of this name that lies within a country's reach (the biggest countries reach 40 degrees from their middle), or null. */
export function cityAt(cc: string, city: string): [number, number] | null {
  const mid = PLACES[cc]
  const found = city ? byName.get(fold(city)) : undefined
  if (!mid || !found) return null
  let best: [number, number] | null = null
  let far = 40
  for (const f of found) {
    const d = apart(f, mid)
    if (d <= far) {
      far = d
      best = f
    }
  }
  return best
}
