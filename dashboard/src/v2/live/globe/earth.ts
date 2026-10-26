// The globe's ground, with no React and no allocation in a frame: the land's outlines, the borders and the graticule as
// unit vectors made once, projected into buffers made once, and drawn as filled and stroked paths. Land is real shapes
// (the world atlas's 110m outlines, in globeData.ts), cut at the horizon: a stretch of an outline that goes behind the
// globe is closed along the rim, so a continent is whole as it turns.
import { BORDERS, LAND, Q } from './globeData'

const RAD = Math.PI / 180
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const DIGIT = new Int8Array(128).fill(-1)
for (let i = 0; i < ABC.length; i++) DIGIT[ABC.charCodeAt(i)] = i

/** Lines made of unit vectors (x, y, z of a point on the sphere), back to back; `end` is where each line stops, `turn` its sign. */
export interface Lines {
  xyz: Float32Array
  end: Int32Array
  turn: Int8Array
  points: number
}

/** Lines from their text (see build-globe.mjs): a turn mark first when `turned`, then steps in quarter degrees from the point before, a "." between lines. */
export function decode(text: string, turned: boolean): Lines {
  const lines = text.split('.')
  const lon: number[] = []
  const lat: number[] = []
  const end = new Int32Array(lines.length)
  const turn = new Int8Array(lines.length)
  lines.forEach((line, k) => {
    let i = 0
    if (turned) turn[k] = line[i++] === '-' ? -1 : 1
    let x = 0
    let y = 0
    const next = () => {
      let z = 0
      let shift = 0
      for (;;) {
        const d = DIGIT[line.charCodeAt(i++)]
        z += (d & 31) * 2 ** shift
        if (d < 32) break
        shift += 5
      }
      return z % 2 ? -(z + 1) / 2 : z / 2
    }
    while (i < line.length) {
      x += next()
      y += next()
      lon.push(x / Q)
      lat.push(y / Q)
    }
    end[k] = lon.length
  })
  return { ...fromDegrees(lon, lat, end), end, turn }
}

/** The longest an edge may be, in radians (about 3 degrees): a longer one is cut into pieces along the sphere, so it bends the way a line on the globe does. */
const LONGEST = 0.052

/** Unit vectors for the points (`ends`, where each line stops, is moved to match the points added on long edges). The first point of a closed outline is its last's neighbour too. */
function fromDegrees(lon: number[], lat: number[], ends: Int32Array): { xyz: Float32Array; points: number } {
  const out: number[] = []
  let start = 0
  for (let r = 0; r < ends.length; r++) {
    const to = ends[r]
    for (let i = start; i < to; i++) {
      const p = lat[i] * RAD
      const l = lon[i] * RAD
      const x = Math.cos(p) * Math.sin(l)
      const y = Math.sin(p)
      const z = Math.cos(p) * Math.cos(l)
      const n = out.length
      if (i > start) {
        const a = Math.acos(Math.max(-1, Math.min(1, x * out[n - 3] + y * out[n - 2] + z * out[n - 1])))
        const pieces = Math.ceil(a / LONGEST)
        for (let k = 1; k < pieces; k++) {
          const t = k / pieces
          const mx = out[n - 3] + (x - out[n - 3]) * t
          const my = out[n - 2] + (y - out[n - 2]) * t
          const mz = out[n - 1] + (z - out[n - 1]) * t
          const d = Math.hypot(mx, my, mz) || 1
          out.push(mx / d, my / d, mz / d)
        }
      }
      out.push(x, y, z)
    }
    start = to
    ends[r] = out.length / 3
  }
  return { xyz: Float32Array.from(out), points: out.length / 3 }
}

/** The graticule: a meridian every 30 degrees and a parallel every 30, as lines. */
function graticule(): Lines {
  const lon: number[] = []
  const lat: number[] = []
  const ends: number[] = []
  for (let m = -180; m < 180; m += 30) {
    for (let p = -80; p <= 80; p += 5) {
      lon.push(m)
      lat.push(p)
    }
    ends.push(lon.length)
  }
  for (let p = -60; p <= 60; p += 30) {
    for (let m = -180; m <= 180; m += 5) {
      lon.push(m)
      lat.push(p)
    }
    ends.push(lon.length)
  }
  const end = Int32Array.from(ends)
  return { ...fromDegrees(lon, lat, end), end, turn: new Int8Array(ends.length) }
}

export const land = decode(LAND, true)
export const borders = decode(BORDERS, false)
export const grid = graticule()

/** Where the globe is on the canvas and which way it faces. */
export interface View {
  cx: number
  cy: number
  r: number
  lat: number
  lon: number
}

const MOST = Math.max(land.points, borders.points, grid.points)
// The projected points: screen x and y, and how far toward the viewer (negative: behind the globe). Shared by every drawing, one set of lines at a time.
const sx = new Float32Array(MOST)
const sy = new Float32Array(MOST)
const sz = new Float32Array(MOST)
// Where a line meets the horizon (set by `cross`).
let hx = 0
let hy = 0

function project(g: Lines, v: View) {
  const cl = Math.cos(v.lon * RAD)
  const sl = Math.sin(v.lon * RAD)
  const cp = Math.cos(v.lat * RAD)
  const sp = Math.sin(v.lat * RAD)
  const a = g.xyz
  for (let i = 0, k = 0; i < g.points; i++, k += 3) {
    const z1 = a[k] * sl + a[k + 2] * cl
    sx[i] = v.cx + v.r * (a[k] * cl - a[k + 2] * sl)
    sy[i] = v.cy - v.r * (a[k + 1] * cp - z1 * sp)
    sz[i] = a[k + 1] * sp + z1 * cp
  }
}

/** The point on the horizon where the line from point `a` (in front) to point `b` (behind) goes over it. */
function cross(v: View, a: number, b: number) {
  const t = sz[a] / (sz[a] - sz[b])
  const x = (sx[a] - v.cx) / v.r + t * ((sx[b] - sx[a]) / v.r)
  const y = (sy[a] - v.cy) / v.r + t * ((sy[b] - sy[a]) / v.r)
  const d = Math.hypot(x, y) || 1
  hx = v.cx + (v.r * x) / d
  hy = v.cy + (v.r * y) / d
}

// The stretches of one outline that are in front of the globe, each from where it comes over the horizon to where it goes behind: its first and last point, and where it crosses the horizon at each end.
const CHAINS = 256
const chainFrom = new Int32Array(CHAINS)
const chainTo = new Int32Array(CHAINS)
const inX = new Float32Array(CHAINS)
const inY = new Float32Array(CHAINS)
const outX = new Float32Array(CHAINS)
const outY = new Float32Array(CHAINS)
const inAt = new Float32Array(CHAINS)
const outAt = new Float32Array(CHAINS)
const used = new Uint8Array(CHAINS)
const TURN = Math.PI * 2

/** The land as filled shapes in the current fill style. An outline that goes behind the globe is cut at the horizon, and each stretch in front is closed along the horizon to the next stretch that comes round in the outline's own direction, so a continent (or a bay across the edge) stays whole as it turns. */
export function fillLand(c: CanvasRenderingContext2D, v: View, g: Lines = land) {
  project(g, v)
  c.beginPath()
  let from = 0
  for (let r = 0; r < g.end.length; r++) {
    const to = g.end[r]
    const n = to - from
    let front = 0
    for (let i = from; i < to; i++) if (sz[i] >= 0) front++
    if (front === n) {
      c.moveTo(sx[from], sy[from])
      for (let i = from + 1; i < to; i++) c.lineTo(sx[i], sy[i])
      c.closePath()
    } else if (front > 0) {
      // The stretches in front, in the outline's order.
      let chains = 0
      const at = (i: number) => from + ((i - from + n) % n)
      for (let i = from; i < to && chains < CHAINS; i++) {
        const prev = at(i - 1)
        if (sz[i] < 0 || sz[prev] >= 0) continue
        // A stretch begins at i; follow it to its last point.
        let last = i
        while (sz[at(last + 1)] >= 0) last = at(last + 1)
        cross(v, i, prev)
        inX[chains] = hx
        inY[chains] = hy
        inAt[chains] = Math.atan2(hy - v.cy, hx - v.cx)
        cross(v, last, at(last + 1))
        outX[chains] = hx
        outY[chains] = hy
        outAt[chains] = Math.atan2(hy - v.cy, hx - v.cx)
        chainFrom[chains] = i
        chainTo[chains] = last
        used[chains++] = 0
      }
      const ccw = g.turn[r] > 0
      for (let s = 0; s < chains; s++) {
        if (used[s]) continue
        let k = s
        c.moveTo(inX[k], inY[k])
        for (;;) {
          used[k] = 1
          for (let i = chainFrom[k], more = true; more; i = at(i + 1)) {
            c.lineTo(sx[i], sy[i])
            more = i !== chainTo[k]
          }
          c.lineTo(outX[k], outY[k])
          // The stretch whose start is next along the horizon in the outline's own direction (the land stays on that side).
          let next = -1
          let best = 9
          for (let m = 0; m < chains; m++) {
            if (used[m] && m !== s) continue
            const d = ccw ? outAt[k] - inAt[m] : inAt[m] - outAt[k]
            const w = d - Math.floor(d / TURN) * TURN
            if (w < best) {
              best = w
              next = m
            }
          }
          if (next < 0) break
          c.arc(v.cx, v.cy, v.r, outAt[k], inAt[next], ccw)
          if (next === s) break
          k = next
        }
        c.closePath()
      }
    }
    from = to
  }
  c.fill()
}

/** Lines (borders, graticule) in the current stroke style: only what is in front, cut at the horizon. */
export function strokeLines(c: CanvasRenderingContext2D, g: Lines, v: View) {
  project(g, v)
  c.beginPath()
  let from = 0
  for (let r = 0; r < g.end.length; r++) {
    const to = g.end[r]
    for (let i = from; i < to; i++) {
      const on = sz[i] >= 0
      const was = i > from && sz[i - 1] >= 0
      if (on && was) c.lineTo(sx[i], sy[i])
      else if (on) {
        if (i > from) {
          cross(v, i, i - 1)
          c.moveTo(hx, hy)
          c.lineTo(sx[i], sy[i])
        } else c.moveTo(sx[i], sy[i])
      } else if (was) {
        cross(v, i - 1, i)
        c.lineTo(hx, hy)
      }
    }
    from = to
  }
  c.stroke()
}
