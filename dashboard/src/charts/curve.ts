// A smooth line through points that never overshoots them: a peak stays the real peak.
export function curve(p: [number, number][]): string {
  if (p.length === 0) return ''
  let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`
  for (let i = 1; i < p.length; i++) {
    const [x0, y0] = p[i - 1]
    const [x1, y1] = p[i]
    const m = (x0 + x1) / 2
    d += `C${m.toFixed(1)},${y0.toFixed(1)} ${m.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`
  }
  return d
}
