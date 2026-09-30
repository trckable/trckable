// The chart models' arithmetic, without React, so each is tested on its own
// (modelMath.test.ts).
import { smooth } from '../smooth'
import { modelCopy } from './modelCopy'
import { channelColor, channelLabel } from '../../lib/palette'
import { otherLabel } from './modelCopy'
import type { ChannelSeries, ChartModel, StackLayer } from './types'

/** At most this many points is a straight line: a curve through three or four points draws hills that were never there. */
export const STRAIGHT_MAX = 4

/** The curve a model draws with: straight for a tiny range, monotone otherwise. */
export function curve(pts: number[][]): string {
  if (pts.length > STRAIGHT_MAX) return smooth(pts)
  return pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join('')
}

/** A running total: bucket by bucket, everything so far. */
export function running(values: number[]): number[] {
  let sum = 0
  return values.map((v) => (sum += v))
}

/** The bucket (Sat/Sun) a day label falls on; only a day-by-day chart has weekends. */
export function isWeekend(label: string, daily: boolean): boolean {
  if (!daily) return false
  const d = new Date(label.slice(0, 10) + 'T00:00:00Z').getUTCDay()
  return d === 0 || d === 6
}

/** Where the plot tops out: the highest thing the model draws, as the scale's input (D's layers add up to the visitors, so its top is theirs). */
export function modelTop(model: ChartModel, values: number[], before: number[]): number {
  if (model === 'E') return Math.max(0, ...running(values), ...running(before))
  return Math.max(0, ...values, ...before)
}

/** Each bucket's height when the layers are stacked. */
export function stackTotals(stack: StackLayer[], n: number): number[] {
  return Array.from({ length: n }, (_, i) => stack.reduce((sum, l) => sum + (l.values[i] ?? 0), 0))
}

/** The edges of each layer: layer k runs from edges[k] up to edges[k + 1]. */
export function stackEdges(stack: StackLayer[], n: number): number[][] {
  const edges: number[][] = [Array<number>(n).fill(0)]
  for (const l of stack) {
    const below = edges[edges.length - 1]
    edges.push(below.map((b, i) => b + (l.values[i] ?? 0)))
  }
  return edges
}

/** The report's channels as layers: the biggest few, by the channel's own colour, and the rest folded into one. */
export function foldStack(raw: ChannelSeries[], keep = 4): StackLayer[] {
  return foldLayers(
    raw.map((s) => ({ name: channelLabel(s.channel), color: channelColor(s.channel), values: s.values })),
    keep,
    { name: otherLabel, color: 'var(--text-3)' },
  )
}

/** The biggest few channels by their total over the period, and everything else as one more layer. */
export function foldLayers(all: { name: string; color: string; values: number[] }[], keep: number, other: { name: string; color: string }): StackLayer[] {
  const total = (l: { values: number[] }) => l.values.reduce((a, b) => a + b, 0)
  const ranked = [...all].sort((a, b) => total(b) - total(a))
  const top = ranked.slice(0, keep)
  const rest = ranked.slice(keep)
  if (!rest.length) return top
  const n = Math.max(...all.map((l) => l.values.length))
  const values = Array.from({ length: n }, (_, i) => rest.reduce((sum, l) => sum + (l.values[i] ?? 0), 0))
  return [...top, { ...other, values }]
}

/** How far ahead of (positive) or behind (negative) the period before, at the end. */
export function paceGap(values: number[], before: number[]): number {
  const cur = running(values)
  const prev = running(before.slice(0, values.length))
  return (cur[cur.length - 1] ?? 0) - (prev[prev.length - 1] ?? 0)
}

/** The change against the period before, in percent; null when there was nothing to compare with. */
export function changePct(a: number, b: number): number | null {
  return b ? Math.round(((a - b) / b) * 100) : null
}

/** What the pace says at the end, and the colour it says it in. */
export function paceSays(gap: number, fmt: (n: number) => string): { word: string; paint: string } {
  if (gap > 0) return { word: modelCopy.aheadBy(fmt(gap)), paint: 'var(--up)' }
  if (gap < 0) return { word: modelCopy.behindBy(fmt(-gap)), paint: 'var(--down)' }
  return { word: modelCopy.onPace, paint: 'var(--text-2)' }
}
