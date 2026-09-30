// The retention card's arithmetic: which cells are finished, the curve over
// them and the one line a short history gets. Pure: retentionModel.test.ts.
import type { Cohorts } from '../../lib/api'

/** The most weeks after the first the card draws. */
export const MAX_WEEKS = 8

export type Cell = { state: 'done'; share: number; back: number } | { state: 'open' }

export type Retention =
  | { kind: 'none' }
  /** Under two whole weeks: the one number there is. */
  | { kind: 'line'; nextWeek: number }
  | { kind: 'table'; weeks: string[]; size: number[]; cols: number; cells: Cell[][]; curve: number[]; top: number }

const clamp = (n: number) => Math.max(0, Math.min(1, n))

/** Weeks after the first that any cohort has finished. */
export const finishedWeeks = (d: Cohorts) => Math.max(0, ...d.back.map((r) => r.length - 1))

/** The share of everyone in the cohorts that finished week k who came back in it. */
function average(d: Cohorts, k: number): number | null {
  let back = 0
  let size = 0
  d.back.forEach((row, i) => {
    if (row.length <= k) return
    back += row[k]
    size += d.size[i]
  })
  return size > 0 ? clamp(back / size) : null
}

export function retentionOf(d: Cohorts | null): Retention {
  if (!d || d.weeks.length === 0) return { kind: 'none' }
  const cols = Math.min(MAX_WEEKS, finishedWeeks(d))
  if (d.weeks.length < 2) {
    const next = average(d, 1)
    return next === null ? { kind: 'none' } : { kind: 'line', nextWeek: next }
  }
  if (cols < 1) return { kind: 'none' }
  const cells = d.back.map((row, i): Cell[] =>
    Array.from({ length: cols }, (_, j): Cell => {
      const k = j + 1
      if (k >= row.length) return { state: 'open' }
      return { state: 'done', share: clamp(row[k] / Math.max(1, d.size[i])), back: row[k] }
    }),
  )
  const curve = Array.from({ length: cols }, (_, j) => average(d, j + 1) ?? 0)
  const top = Math.max(0, ...cells.flat().map((c) => (c.state === 'done' ? c.share : 0)))
  return { kind: 'table', weeks: d.weeks, size: d.size, cols, cells, curve, top }
}

/** How much accent a cell gets, on one ramp from the faintest to a third of it; light text reads on all of it. */
export function shade(share: number, top: number): number {
  if (!(top > 0)) return 0
  return Math.round(6 + (clamp(share / top) * 32))
}
