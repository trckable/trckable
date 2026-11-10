// What the chart shows besides the people line, chosen once for the site: its money, else its sign-ups, else its
// pageviews. The bars, their right-hand axis and the faces at each payment or sign-up are worked out here. Pure: outcome.test.ts.
import { threeScale } from '../../charts/timeScale'

export type Outcome = 'revenue' | 'signups' | 'views'

/** The site's main outcome: payments when it has revenue, else sign-ups when it has a signup goal, else pageviews. */
export function outcomeOf(a: { money: boolean; signup: boolean }): Outcome {
  if (a.money) return 'revenue'
  return a.signup ? 'signups' : 'views'
}

/** One payment or sign-up: when (the site's clock, "2026-10-16T16:30"), whose face, what the hover says and how big it is. */
export interface Mark {
  at: string
  id: string
  text: string
  size: number
}

/** The marks of one bucket as one face: the biggest one's, with the count of the others. */
export interface Face {
  i: number
  id: string
  more: number
  text: string
  size: number
}

/** Faces stay readable on a long period: at most this many are drawn, the biggest. */
export const MAX_FACES = 12
/** Two faces never sit closer than this many pixels. */
export const FACE_GAP = 22

/** The bucket a moment falls in: the last one that began at or before it. */
export function bucketAt(labels: string[], at: string): number {
  let lo = 0
  let hi = labels.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (labels[mid] <= at) {
      found = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return found
}

/** Marks grouped per bucket, one face each ("+N" for the rest), the biggest when there are more than `max`. */
export function facesOf(labels: string[], marks: Mark[], max = MAX_FACES): Face[] {
  if (!labels.length) return []
  const by = new Map<number, Mark[]>()
  for (const m of marks) {
    const i = bucketAt(labels, m.at)
    if (i < 0 || m.at.slice(0, 10) > labels[labels.length - 1].slice(0, 10)) continue
    by.set(i, [...(by.get(i) ?? []), m])
  }
  const faces = [...by].map(([i, ms]): Face => {
    const sorted = [...ms].sort((a, b) => b.size - a.size)
    const rest = sorted.length - 1
    const text = sorted.slice(0, 3).map((m) => m.text).join(', ') + (rest > 2 ? ` +${rest - 2}` : '')
    return { i, id: sorted[0].id, more: rest, text, size: ms.reduce((s, m) => s + m.size, 0) }
  })
  return faces.sort((a, b) => b.size - a.size || a.i - b.i).slice(0, max).sort((a, b) => a.i - b.i)
}

/** Drops the faces that would sit closer than `gap` to a bigger one. */
export function apart(faces: Face[], x: (i: number) => number, gap = FACE_GAP): Face[] {
  const kept: Face[] = []
  for (const f of [...faces].sort((a, b) => b.size - a.size || a.i - b.i)) {
    if (kept.every((k) => Math.abs(x(k.i) - x(f.i)) >= gap)) kept.push(f)
  }
  return kept.sort((a, b) => a.i - b.i)
}

/** The right-hand axis: 0, half and the top, round in the bars' own units. Nothing counted: only the baseline. */
export function barScale(vals: number[]): { max: number; ticks: number[] } {
  const top = Math.max(0, ...vals)
  if (!(top > 0)) return { max: 1, ticks: [0] }
  const s = threeScale(top)
  return { max: s.max, ticks: [0, s.step, s.max] }
}

/** A bar's width: its slot's share, thin on a long period, never a hairline and never fat. */
export function barWidth(plotW: number, n: number): number {
  const slot = plotW / Math.max(1, n)
  return Math.max(1.5, Math.min(slot * 0.6, n <= 7 ? 26 : 16, slot - 1))
}
