// The Briefing's drawings as plain numbers: the smooth line through a series, the gridlines, a sparkline. Pure: geometry.test.ts.

type XY = [number, number]

/** A smooth path through the points (each segment bends toward its neighbours), the way the cards' lines are drawn. */
export function smooth(P: XY[]): string {
  const n = P.length
  if (n === 0) return ''
  let d = `M${P[0][0].toFixed(1)},${P[0][1].toFixed(1)}`
  for (let i = 0; i < n - 1; i++) {
    const p0 = P[i - 1] ?? P[i]
    const p1 = P[i]
    const p2 = P[i + 1]
    const p3 = P[i + 2] ?? p2
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d
}

/** The step between gridlines: 1, 2 or 5 times a power of ten, with at most four lines under the top. */
export function niceStep(max: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(max / 3 || 1)))
  const s = [1, 2, 5, 10].map((x) => x * p).find((x) => max / x <= 4) ?? 10 * p
  return Math.max(1, s)
}

/** A card's sparkline in a 300 x h box: the line, and the same path closed down to the bottom for the glow. Under two points there is none. */
export function spark(vals: number[], h: number, lo = 0, hi?: number): { line: string; area: string } | null {
  const n = vals.length
  if (n < 2) return null
  const mx = Math.max(hi ?? Math.max(...vals), lo + 1e-6)
  const top = 10
  const bot = h - 4
  const P: XY[] = vals.map((v, i) => [(i / (n - 1)) * 300, bot - ((Math.min(Math.max(v, lo), mx) - lo) / (mx - lo)) * (bot - top)])
  const line = smooth(P)
  return { line, area: `${line} L300,${h} L0,${h} Z` }
}

/** The ring's dash for a score out of 100 on a circle of radius r. */
export const dash = (score: number, r = 27): string => {
  const c = 2 * Math.PI * r
  return `${((c * score) / 100).toFixed(1)} ${c}`
}

/** The ring's colour: lime from 80, amber from 55, red under it. */
export function ringTone(score: number): 'lime' | 'amber' | 'red' {
  if (score >= 80) return 'lime'
  return score >= 55 ? 'amber' : 'red'
}
