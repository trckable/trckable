// The curve every time line is drawn with.
/** A curve through every point that never overshoots them (monotone cubic,
 *  Fritsch–Carlson): a quiet day between two busy ones dips, it does not
 *  swing below zero, and a peak is drawn where it happened, no higher. */
export function smooth(pts: number[][]): string {
  const n = pts.length
  if (n === 0) return ''
  const P = (i: number) => pts[i]
  if (n < 3) return pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join('')
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
  let out = `M${P(0)[0].toFixed(1)} ${P(0)[1].toFixed(1)}`
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = P(i) as [number, number]
    const [x1, y1] = P(i + 1) as [number, number]
    const h = (x1 - x0) / 3
    out += `C${(x0 + h).toFixed(1)} ${(y0 + m[i] * h).toFixed(1)} ${(x1 - h).toFixed(1)} ${(y1 - m[i + 1] * h).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`
  }
  return out
}
