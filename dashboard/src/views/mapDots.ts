// The country outlines as a grid of dots. Pure geometry, worked out once: outlines that cross the map's edge (Russia,
// Fiji) are unwrapped first, so they no longer draw a band across the world. Antarctica is left out.
type Pt = [number, number]

/** An outline's points, with its jumps across the map's edge undone. */
export function unwrap(points: Pt[], width: number): Pt[] {
  let shift = 0
  return points.map(([x, y], i) => {
    if (i > 0) {
      const prev = points[i - 1][0]
      if (x - prev > width / 2) shift -= width
      else if (prev - x > width / 2) shift += width
    }
    return [x + shift, y]
  })
}

export function inside([x, y]: Pt, ring: Pt[]): boolean {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

function rings(d: string, width: number): Pt[][] {
  return d
    .split('M')
    .filter(Boolean)
    .map((sub) => {
      const n = sub.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
      const pts: Pt[] = []
      for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i], n[i + 1]])
      return unwrap(pts, width)
    })
}

/** Each country's dots, as one path of zero-length strokes: a round line cap draws each as a dot. */
export function dotPaths(countries: [string, string][], width: number, pitch: number): [string, string][] {
  const out: [string, string][] = []
  for (const [code, d] of countries) {
    if (code === 'AQ') continue
    let path = ''
    for (const ring of rings(d, width)) {
      const xs = ring.map((p) => p[0])
      const ys = ring.map((p) => p[1])
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
      for (let row = Math.ceil(y0 / pitch); row * pitch <= y1; row++) {
        const y = row * pitch
        const off = row % 2 ? pitch / 2 : 0
        for (let col = Math.ceil((x0 - off) / pitch); col * pitch + off <= x1; col++) {
          const x = col * pitch + off
          if (inside([x, y], ring)) path += `M${((x % width) + width) % width},${y}h0`
        }
      }
    }
    if (path) out.push([code, path])
  }
  return out
}
