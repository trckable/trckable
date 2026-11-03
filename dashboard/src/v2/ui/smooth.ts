// A line through points as smooth curves that never overshoot (monotone cubic, Fritsch–Carlson): a peak stays the
// peak and a zero stays on the floor. segs[k] is the curve from point k to k+1, so a stretch of the line can be drawn
// on its own and lies exactly on the whole. Pure: smooth.test.ts.
export type Pt = [number, number]

export function segments(p: Pt[]): string[] {
  const n = p.length
  if (n < 2) return []
  const d: number[] = []
  for (let k = 0; k < n - 1; k++) d.push((p[k + 1][1] - p[k][1]) / (p[k + 1][0] - p[k][0] || 1))
  const m: number[] = p.map((_, k) => (k === 0 ? d[0] : k === n - 1 ? d[n - 2] : d[k - 1] * d[k] <= 0 ? 0 : (d[k - 1] + d[k]) / 2))
  for (let k = 0; k < n - 1; k++) {
    if (d[k] === 0) {
      m[k] = 0
      m[k + 1] = 0
      continue
    }
    const a = m[k] / d[k]
    const b = m[k + 1] / d[k]
    const s = a * a + b * b
    if (s > 9) {
      const t = 3 / Math.sqrt(s)
      m[k] = t * a * d[k]
      m[k + 1] = t * b * d[k]
    }
  }
  const f = (v: number) => Math.round(v * 10) / 10
  return p.slice(0, -1).map(([x0, y0], k) => {
    const [x1, y1] = p[k + 1]
    const h = (x1 - x0) / 3
    return `C${f(x0 + h)},${f(y0 + m[k] * h)} ${f(x1 - h)},${f(y1 - m[k + 1] * h)} ${f(x1)},${f(y1)}`
  })
}

// The path of points a..b (inclusive) of the line whose curves are segs.
export function stretch(p: Pt[], segs: string[], a: number, b: number): string {
  return `M${p[a][0]},${p[a][1]}${segs.slice(a, b).join('')}`
}
