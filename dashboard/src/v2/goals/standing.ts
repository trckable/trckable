// A goal that stands out, as the bell's card, the goals list and a goal's page tell it. The rule is the server's
// (server/internal/standsout): these only word what it answered. Pure: standing.test.ts.
import { fmtFixed, fmtInt } from '../../lib/format'
import { goalName } from '../../lib/goalName'
import { sourceName } from '../briefing/model'
import { stand } from './standCopy'

/** What the server says of one goal over a stretch: whether it stands out and why. */
export interface Standing {
  out?: boolean
  why?: 'first' | 'times'
  /** For `times`: how many times a usual day, rounded down. */
  factor?: number
  /** A usual day: the median of the days it was reached in the 28 before. */
  usual?: number
}

/** The short reason a goal stands out ("First time ever", "5× a usual day"); '' when it is as usual. */
export function reasonOf(g: Standing): string {
  if (!g.out) return ''
  return g.why === 'first' ? stand.first : stand.times(fmtInt(g.factor ?? 0))
}

/** The sentence on a goal's page: why it stands out, or "As usual.". */
export function whyOf(g: Standing): string {
  if (g.out && g.why === 'first') return stand.whyFirst
  if (g.out) return stand.whyTimes(fmtInt(g.factor ?? 0), fmtUsual(g.usual ?? 0))
  return stand.usualAsUsual
}

/** A goal as people read it: its label as written, else its key in words; a page goal's name is its own. */
export function nameOf(g: { name?: string; goal: string; page?: boolean }): string {
  if (g.page) return g.name ?? g.goal
  return goalName(g.name && g.name !== g.goal ? g.name : undefined, g.goal)
}

/** A usual day's count: whole numbers as they are, else one decimal. */
export const fmtUsual = (n: number): string => (Number.isInteger(n) ? fmtInt(n) : fmtFixed(n, 1))

/** The goals that stand out come first, each group in the order it came. */
export function split<T extends Standing>(goals: T[]): { out: T[]; usual: T[] } {
  return { out: goals.filter((g) => g.out), usual: goals.filter((g) => !g.out) }
}

/** What the list says in its "vs usual" column: "New" for a first time, "↑ 3×", or "as usual". */
export function versus(g: Standing): string {
  if (!g.out) return stand.vsAsUsual
  return g.why === 'first' ? stand.vsFirst : `↑ ${fmtInt(g.factor ?? 0)}×`
}

/** Who sent them, as people say it: the brand or host, "Direct" for none. */
export function sourceWords(s: string | undefined): string {
  if (!s || s === 'Direct') return stand.direct
  return s.includes('.') ? sourceName(s) : s
}
