// The shapes the kit draws, apart from how they look: pure, so kit.test.ts can
// check them without a browser.
import { smooth } from '../charts/smooth'
import { moveOf, type Move } from '../charts/change'

export type Tone = 'good' | 'bad' | 'warn' | 'neutral'

/** A share from none to all, whatever came in. */
export const clampPct = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0)

/** The top half of a ring as an SVG path: left end, over the top, right end. */
export const halfRing = (cx: number, cy: number, r: number) => `M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`

/** Where `pct` of a half ring ends (0 is the left end, 100 the right). */
export function ringPoint(cx: number, cy: number, r: number, pct: number) {
  const a = Math.PI * (1 - clampPct(pct) / 100)
  return { x: +(cx + r * Math.cos(a)).toFixed(1), y: +(cy - r * Math.sin(a)).toFixed(1) }
}

/** A move's tone: up is good unless a lower number is the good one (bounce rate). */
export function toneOf(m: Move | null, lowerIsBetter = false): Tone {
  if (!m || m.dir === 'flat') return 'neutral'
  return (m.dir === 'up') !== lowerIsBetter ? 'good' : 'bad'
}

/** "▲ 12%" text and tone for now against before; null when there is nothing to compare. */
export function deltaOf(now: number, was: number | undefined, up: string, down: string, lowerIsBetter = false) {
  const m = moveOf(now, was)
  if (!m || m.dir === 'flat') return null
  return { text: `${m.dir === 'up' ? up : down} ${m.pct}%`, tone: toneOf(m, lowerIsBetter) }
}

/** The scale a line is drawn on: its own top and bottom unless given, and `slots` points wide (more than it has when it stops short of the edge). */
export type AreaScale = { min?: number; max?: number; slots?: number }

/** A line through `values` and the same line closed down to the floor, for a soft area. */
export function areaPaths(values: number[], w: number, h: number, pad = 4, scale: AreaScale = {}) {
  if (values.length === 0) return { line: '', area: '' }
  const max = scale.max ?? Math.max(...values)
  const min = scale.min ?? Math.min(...values)
  const span = max - min || 1
  const steps = Math.max((scale.slots ?? values.length) - 1, 1)
  const x = (i: number) => (values.length > 1 || scale.slots ? (i / steps) * w : w / 2)
  const y = (v: number) => (max === min ? h / 2 : h - pad - ((v - min) / span) * (h - pad * 2))
  const pts = values.map((v, i) => [x(i), y(v)])
  const line = smooth(pts)
  return { line, area: `${line}L${x(values.length - 1).toFixed(1)} ${h}L${x(0).toFixed(1)} ${h}Z` }
}

/** The colour a tone draws in. */
export const toneColor = (t: Tone) => ({ good: 'var(--up)', bad: 'var(--down)', warn: 'var(--warn)', neutral: 'var(--accent)' })[t]
