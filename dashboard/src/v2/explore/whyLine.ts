// The instant "Why?" line of a card, worked out from the rows the card already shows (no request), and the aggregate
// numbers handed to a build's Peek with the question. Pure: whyLine.test.ts.
import type { AskContext } from '../slots'
import type { Row } from './types'

/** Rows handed over with a question, at most. */
export const WHY_ROWS = 20

export type Mover = AskContext['rows'][number]

/** The row that moved most against the period before; none when nothing moved or there is nothing to compare. */
export function biggestMover(rows: Row[]): Mover | null {
  let top: Mover | null = null
  for (const r of rows) {
    if (r.c == null) continue
    const delta = r.v - r.c
    if (delta !== 0 && (!top || Math.abs(delta) > Math.abs(top.delta))) top = { name: r.name, now: r.v, before: r.c, delta }
  }
  return top
}

/** What a build's Peek is given with a Why? question: aggregate rows only, never a visitor. */
export function whyContext(rows: Row[], o: { metric: string; period: string; compare: string }): AskContext {
  const shown = rows
    .filter((r) => r.c != null)
    .slice(0, WHY_ROWS)
    .map((r) => ({ name: r.name, now: r.v, before: r.c, delta: r.v - r.c }))
  return { ...o, rows: shown }
}
