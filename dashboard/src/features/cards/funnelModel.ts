// The funnel card's arithmetic: the result line, each step's bar and what was
// lost between two steps. Pure: funnelModel.test.ts.
import type { FunnelResult } from '../../lib/api'

export interface Step {
  value: string
  visitors: number
  /** Share of the first step, for the bar's length. */
  bar: number
  /** Share of the step before that carried on: 1 on the first. */
  rate: number
  /** What was lost between this step and the one before: null on the first. */
  loss: { pct: number; left: number } | null
}

export interface Funnel {
  steps: Step[]
  /** Share of the first step that made it to the last. */
  made: number
  /** Seconds along the way: the one step's median for two steps, the steps' medians added up for more. */
  seconds: number
  /** The seconds are one median (two steps) or a sum of medians (more). */
  exact: boolean
}

export function funnelOf(res: FunnelResult[]): Funnel | null {
  if (res.length < 2) return null
  const top = Math.max(1, res[0].visitors)
  const steps = res.map((s, i): Step => ({
    value: s.value,
    visitors: s.visitors,
    bar: Math.max(0, Math.min(1, s.visitors / top)),
    rate: Math.max(0, Math.min(1, s.rate)),
    loss: i === 0 ? null : { pct: Math.round((1 - Math.max(0, Math.min(1, s.rate))) * 100), left: res[i - 1].dropped },
  }))
  return {
    steps,
    made: steps[steps.length - 1].bar,
    seconds: res.slice(1).reduce((sum, s) => sum + Math.max(0, s.median_s), 0),
    exact: res.length === 2,
  }
}
