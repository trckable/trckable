// The rows the goal cards and the header's Goals menu both draw: the period's goals by how many reached them, and the
// saved funnels by how many go all the way. Pure; model.test.ts.
import type { Row } from '../../lib/api'
import { goalName } from '../../lib/goalName'
import { copy } from './copy'

export type Kind = 'goal' | 'form' | 'funnel'

/** How the number moved against the period before: absent when there is nothing to set it against. */
export interface Change {
  dir: 'up' | 'down' | 'flat'
  /** Whole percent, never negative. */
  pct: number
}

export interface GoalRow {
  key: string
  kind: Kind
  name: string
  /** A goal's key (the filter that narrows Explore to it); empty for a funnel. */
  value: string
  /** People who reached the goal, or the share (0 to 1) of a funnel's first step that reached its last. */
  amount: number
  unit: 'people' | 'rate'
  change: Change | null
}

/** A saved funnel as the Briefing reads it: each step's people in the period and in the one before. */
export interface FunnelSteps {
  name?: string
  steps: { v: number; c: number }[]
}

/** The cards: four at most, the funnel being the last of them. */
export const MAX_CARDS = 4

/** The move from `before` to `now`; none where the period before had nobody (a percent of nothing) or was not read. */
export function changeOf(now: number, before: number | undefined): Change | null {
  if (before === undefined || before <= 0) return null
  const pct = Math.round((Math.abs(now - before) / before) * 100)
  if (pct === 0) return { dir: 'flat', pct: 0 }
  return { dir: now > before ? 'up' : 'down', pct }
}

/** Every goal of the period, most reached first. `prev` is the period before (undefined when it is not compared; null is a period with no goals). */
export function goalRows(cur: Row[] | null | undefined, prev: Row[] | null | undefined): GoalRow[] {
  return [...(cur ?? [])]
    .sort((a, b) => b.visitors - a.visitors)
    .map((g) => ({
      key: 'g:' + g.value,
      kind: g.value === 'form_submit' ? 'form' : 'goal',
      name: goalName(g.label, g.value),
      value: g.value,
      amount: g.visitors,
      unit: 'people',
      change: prev === undefined ? null : changeOf(g.visitors, (prev ?? []).find((x) => x.value === g.value)?.visitors ?? 0),
    }))
}

/** The share who go from a funnel's first step to its last; none when nobody entered. */
export function conversionOf(steps: { v: number }[]): number | null {
  if (steps.length < 2 || steps[0].v <= 0) return null
  return steps[steps.length - 1].v / steps[0].v
}

/** A funnel's row, or none when it has no steps to speak of or nobody entered it. */
export function funnelRow(f: FunnelSteps | null | undefined, compared: boolean): GoalRow | null {
  if (!f) return null
  const now = conversionOf(f.steps)
  if (now === null) return null
  const before = conversionOf(f.steps.map((s) => ({ v: s.c })))
  return { key: 'f:' + (f.name ?? ''), kind: 'funnel', name: f.name || copy.funnel, value: '', amount: now, unit: 'rate', change: compared && before !== null ? changeOf(now, before) : null }
}

/** The Briefing's cards: the top goals, then the funnel last, four in all. */
export function cardRows(goals: GoalRow[], funnel: GoalRow | null): GoalRow[] {
  return [...goals.slice(0, funnel ? MAX_CARDS - 1 : MAX_CARDS), ...(funnel ? [funnel] : [])]
}
