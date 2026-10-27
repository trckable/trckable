// Turns the world atlas into the globe's small tables, once, at build time: the land's outlines and the borders between
// countries (thinned, as text) and one centre point per country. No map tiles, no network: the dashboard bundles the result.
//
// Run with `npm run build:globe` after changing anything here.
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { CITIES, SEAS } from './globe-names.mjs'

const require = createRequire(import.meta.url)
const land = require('world-atlas/land-110m.json')
const land50 = require('world-atlas/land-50m.json')
const countries50 = require('world-atlas/countries-50m.json')
const { feature, mesh } = require('topojson-client')
const countries110 = require('world-atlas/countries-110m.json')
const iso = require('iso-3166-1')

const Q = 4 // the base land is stored in quarter degrees
const TOL = 0.1 // degrees a vertex may move when the outline is thinned
const Q2 = 16 // the detail (50m) land is stored in sixteenths of a degree
const TOL2 = 0.04
const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates)

/** Douglas-Peucker: the vertices that keep the line within TOL of itself. */
function thin(pts, tol = TOL) {
  if (pts.length < 3) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const todo = [[0, pts.length - 1]]
  while (todo.length) {
    const [a, b] = todo.pop()
    const [ax, ay] = pts[a]
    const [bx, by] = pts[b]
    const dx = bx - ax
    const dy = by - ay
    let far = 0
    let at = -1
    for (let i = a + 1; i < b; i++) {
      const t = dx || dy ? Math.max(0, Math.min(1, ((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / (dx * dx + dy * dy))) : 0
      const d = Math.hypot(pts[i][0] - (ax + t * dx), pts[i][1] - (ay + t * dy))
      if (d > far) {
        far = d
        at = i
      }
    }
    if (far > tol && at > 0) {
      keep[at] = 1
      todo.push([a, at], [at, b])
    }
  }
  return pts.filter((_, i) => keep[i])
}

// Numbers as characters: zig-zag, five bits to a character, the sixth bit says another follows.
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
function num(n) {
  let z = n < 0 ? -2 * n - 1 : 2 * n
  let s = ''
  while (z >= 32) {
    s += ABC[32 + (z & 31)]
    z >>= 5
  }
  return s + ABC[z]
}

/** Lines as text: each line starts with its turn (+ or -, only for outlines) and then its points as steps from the one before, a "." between lines. */
function pack(lines, turn, q = Q) {
  return lines
    .map((l) => {
      let lx = 0
      let ly = 0
      const body = l
        .map(([x, y]) => {
          const qx = Math.round(x * q)
          const qy = Math.round(y * q)
          const out = num(qx - lx) + num(qy - ly)
          lx = qx
          ly = qy
          return out
        })
        .join('')
      return (turn ? (l.turn > 0 ? '+' : '-') : '') + body
    })
    .join('.')
}

// The land's outlines (closed rings: the first point is not repeated). A ring's turn is its sign in the lon/lat plane (counter-clockwise +): the globe needs it to close an outline along the horizon.
function outlines(topo, tol) {
  const polys = feature(topo, topo.objects.land).features.flatMap((f) => polysOf(f.geometry))
  return polys.flat().map((r) => {
    // Lay the ring out without a jump over the antimeridian, then take its turn from the area (clockwise outlines are the land, counter-clockwise ones lakes inside it).
    const flat = [r[0][0]]
    for (let i = 1; i < r.length; i++) flat.push(flat[i - 1] + ((((r[i][0] - r[i - 1][0] + 540) % 360) + 360) % 360) - 180)
    const net = flat[flat.length - 1] - flat[0]
    let turn = 0
    if (Math.abs(net) > 180) {
      // The outline goes all the way round a pole (Antarctica): the land is the cap, on the right going east around the south pole.
      const south = r.reduce((a, p) => a + p[1], 0) < 0
      turn = net > 0 === south ? -1 : 1
    } else {
      let area = 0
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) area += flat[j] * r[i][1] - flat[i] * r[j][1]
      turn = area >= 0 ? 1 : -1
    }
    const t = thin(r.slice(0, -1), tol)
    t.turn = turn
    return t
  }).filter((t) => t.length >= 3)
}
const rings = outlines(land, TOL)
// The borders between countries, as lines (110m).
const borders = mesh(countries110, countries110.objects.countries, (a, b) => a !== b).coordinates.map((l) => thin(l))
// The detail (50m), loaded only when someone zooms in.
const rings50 = outlines(land50, TOL2)
const borders50 = mesh(countries50, countries50.objects.countries, (a, b) => a !== b).coordinates.map((l) => thin(l, TOL2))

// One point per country: the middle of its largest piece, to a whole degree.
const ring = (r) => {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const f = r[j][0] * r[i][1] - r[i][0] * r[j][1]
    a += f
    cx += (r[j][0] + r[i][0]) * f
    cy += (r[j][1] + r[i][1]) * f
  }
  return { a: Math.abs(a / 2), x: cx / (3 * a), y: cy / (3 * a) }
}
const places = {}
const areas = {}
for (const f of feature(countries50, countries50.objects.countries).features) {
  const rec = iso.whereNumeric(String(f.id).padStart(3, '0'))
  const code = rec?.alpha2 ?? (f.properties.name === 'Kosovo' ? 'XK' : null)
  if (!code) continue
  const best = polysOf(f.geometry).map((p) => ring(p[0])).sort((a, b) => b.a - a.a)[0]
  if (best && Number.isFinite(best.x)) {
    places[code] = [Math.round(best.y), Math.round(best.x)]
    areas[code] = polysOf(f.geometry).reduce((n, p) => n + ring(p[0]).a * Math.cos((ring(p[0]).y * Math.PI) / 180), 0)
  }
}
// Small states the 50m atlas leaves out.
Object.assign(places, { SG: [1, 104], MT: [36, 14], MC: [44, 7], SM: [44, 12], VA: [42, 12], LI: [47, 9], AD: [43, 2], BH: [26, 50], MV: [4, 73], HK: [22, 114], MO: [22, 114], BB: [13, -59], MU: [-20, 58] })

const body = `// Generated by scripts/build-globe.mjs from world-atlas. Do not edit.
// LAND and BORDERS: outlines and lines as text (see decode in earth.ts), in quarter degrees.
export const Q = ${Q}
export const LAND = ${JSON.stringify(pack(rings, true))}
export const BORDERS = ${JSON.stringify(pack(borders, false))}
// PLACES: one [lat, lon] per country, the middle of its largest piece. The server stores a country and a city name, never coordinates.
export const PLACES: Record<string, [number, number]> = ${JSON.stringify(places)}
`
writeFileSync(new URL('../src/v2/live/globe/globeData.ts', import.meta.url), body)
console.log(`${rings.length} outlines, ${borders.length} border lines, ${Object.keys(places).length} places, ${(body.length / 1024).toFixed(1)} KB raw`)

// The detail: loaded when someone zooms in. The 50m land and borders, the countries from the largest to the smallest (the order their names are written in), the cities and the seas.
const rank = Object.keys(areas).sort((a, b) => areas[b] - areas[a])
const detail = `// Generated by scripts/build-globe.mjs from world-atlas and scripts/globe-names.mjs. Do not edit.
// LAND and BORDERS: the 50m outlines and lines, as text (see decode in earth.ts), in eighth degrees.
export const Q = ${Q2}
export const LAND = ${JSON.stringify(pack(rings50, true, Q2))}
export const BORDERS = ${JSON.stringify(pack(borders50, false, Q2))}
// RANK: the country codes, the largest first.
export const RANK = ${JSON.stringify(rank.join(' '))}
// CITIES and SEAS: [name, lat, lon, tier].
export const CITIES: [string, number, number, number][] = ${JSON.stringify(CITIES)}
export const SEAS: [string, number, number, number][] = ${JSON.stringify(SEAS)}
`
writeFileSync(new URL('../src/v2/live/globe/globeDetail.ts', import.meta.url), detail)
console.log(`detail: ${rings50.length} outlines, ${borders50.length} border lines, ${(detail.length / 1024).toFixed(1)} KB raw`)
