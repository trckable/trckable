// What the report's counts say, in the four states the screen shows. No score, no percentage: a count of answers.
import type { AnswersReport, Cell, Engine, PageRow, State } from './api'
import { ENGINES } from './api'

/** One assistant's state for a question: the best any of its runs showed. */
export function cellState(c: Cell | undefined): State {
  if (!c || c.runs === 0) return 'none'
  if (c.named > 0 && c.cited > 0) return 'both'
  if (c.named > 0) return 'named'
  if (c.cited > 0) return 'cited'
  return 'none'
}

/** The assistants this server asks, in the order the screen lists them. */
export const enginesOf = (rep: AnswersReport): Engine[] => ENGINES.filter((e) => rep.engines.includes(e))

/** Which empty state, if any, the report is in: no key on the server, no questions, or the first round not done. */
export type Phase = 'noengine' | 'noquestions' | 'first' | 'ok'

export function phaseOf(rep: AnswersReport): Phase {
  if (rep.engines.length === 0) return 'noengine'
  if (!(rep.questions ?? []).some((q) => q.active)) return 'noquestions'
  return rep.latest?.complete || rep.was ? 'ok' : 'first'
}

/** The question whose answer named the site for the first time ever, when that was lately. */
export function firstEver(rep: AnswersReport, now: number) {
  return (rep.changes ?? []).find((c) => c.first_ever && c.kind === 'seen' && now - c.at < 14 * 86400)
}

/** How many of the questions' answers each assistant took part in, to say "2 of 2 runs". */
export const runsOf = (c: Cell | undefined): [number, number] => [c?.seen ?? 0, c?.runs ?? 0]

/** The pages with their money left out when the revenue module is off, so the table drops the column. */
export const hasEarned = (rows: PageRow[]) => rows.some((r) => r.revenue !== undefined)
export const hasTraffic = (rows: PageRow[]) => rows.some((r) => r.read !== undefined)
