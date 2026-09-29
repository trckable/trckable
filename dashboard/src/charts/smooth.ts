// The curve every time line is drawn with.
/** A curve through every point that never overshoots them (monotone cubic,
 *  Fritsch–Carlson): a quiet day between two busy ones dips, it does not
 *  swing below zero, and a peak is drawn where it happened, no higher. */
export function smooth(pts: number[][]): string {
  const n = pts.length
  if (n === 0) return ''
  const P = (i: number) => pts[i]
  if (n < 3) return pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join('')
  const m = tangents(pts)
  let out = `M${P(0)[0].toFixed(1)} ${P(0)[1].toFixed(1)}`
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = P(i) as [number, number]
    const [x1, y1] = P(i + 1) as [number, number]
    const h = (x1 - x0) / 3
    out += `C${(x0 + h).toFixed(1)} ${(y0 + m[i] * h).toFixed(1)} ${(x1 - h).toFixed(1)} ${(y1 - m[i + 1] * h).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`
  }
  return out
}

/** Fritsch–Carlson tangents (dy/dx) at each point. */
function tangents(pts: number[][]): number[] {
  const n = pts.length
  const P = (i: number) => pts[i]
  const d: number[] = []
  for (let i = 0; i < n - 1; i++) d.push((P(i + 1)[1] - P(i)[1]) / (P(i + 1)[0] - P(i)[0] || 1))
  const m: number[] = [d[0]]
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2)
  m.push(d[n - 2])
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = m[i + 1] = 0
      continue
    }
    const a = m[i] / d[i]
    const b = m[i + 1] / d[i]
    const h = a * a + b * b
    if (h > 9) {
      const t = 3 / Math.sqrt(h)
      m[i] = t * a * d[i]
      m[i + 1] = t * b * d[i]
    }
  }
  return m
}

/** The point on that same curve at a position between the points (2.5 is
 *  halfway from the third to the fourth): where a marker rides the line. */
export function pointOn(pts: number[][], pos: number): [number, number] {
  const n = pts.length
  if (n === 0) return [0, 0]
  const at = Math.max(0, Math.min(n - 1, pos))
  const i = Math.min(n - 2, Math.floor(at))
  if (n < 3 || i < 0) {
    if (n < 2) return [pts[0][0], pts[0][1]]
    const f = at - i
    return [pts[i][0] + f * (pts[i + 1][0] - pts[i][0]), pts[i][1] + f * (pts[i + 1][1] - pts[i][1])]
  }
  const m = tangents(pts)
  const [x0, y0] = pts[i]
  const [x1, y1] = pts[i + 1]
  const h = x1 - x0
  const t = at - i
  const t2 = t * t
  const t3 = t2 * t
  const y = (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m[i + 1]
  return [x0 + t * h, y]
}
