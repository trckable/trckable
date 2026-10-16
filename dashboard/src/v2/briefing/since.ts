// "Since this morning": what happened after nine, the hour the walkthrough takes as the last time you looked. Pure: since.test.ts.
import type { Point } from '../../lib/api'

/** The hour the day is taken to start for someone looking in (the walkthrough's own). */
export const LOOKED_AT = 9

export interface Since {
  /** "this morning" from two hours on, the hour itself before. */
  morning: boolean
  at: string
  people: number
  sales: number
  /** Minutes the site was down since then. */
  down: number
  /** Nothing to report: nobody bought, nothing went down, and the page has no card to show. */
  quiet: boolean
}

export interface SinceIn {
  series: Point[]
  /** Minutes into the day. */
  nowMin: number
  sales: number
  /** Seconds down since the hour, over all incidents. */
  downSec: number
  /** No card to show and nobody paid: a day with nothing in it. */
  calm: boolean
}

export function sinceOf(i: SinceIn): Since | null {
  const lock = LOOKED_AT * 60
  if (i.nowMin < lock + 30) return null
  const people = i.series.slice(LOOKED_AT).reduce((n, p) => n + p.visitors, 0)
  const down = Math.round(i.downSec / 60)
  return { morning: i.nowMin - lock >= 120, at: `${String(LOOKED_AT).padStart(2, '0')}:00`, people, sales: i.sales, down, quiet: i.sales === 0 && down <= 0 && i.calm }
}
