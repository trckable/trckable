// The target alert as the dashboard holds it: a metric, a period and a number, with the rule a new one starts as.
import type { Alert } from '../../lib/api'

export const METRICS = ['sales', 'revenue', 'visitors'] as const
export const PERIODS = ['day', 'week', 'month', 'all'] as const
export type Metric = (typeof METRICS)[number]
export type Period = (typeof PERIODS)[number]
export interface Rule {
  metric: Metric
  period: Period
  threshold: number
}

const START: Rule = { metric: 'sales', period: 'day', threshold: 10 }

const metricOf = (v?: string) => METRICS.find((m) => m === v)
const periodOf = (v?: string) => PERIODS.find((p) => p === v)

/** The rule an alert holds; a new one (or one with a part missing) starts as ten sales in a day. */
export function ruleOf(a?: Pick<Alert, 'metric' | 'period' | 'threshold'>): Rule {
  return { metric: metricOf(a?.metric) ?? START.metric, period: periodOf(a?.period) ?? START.period, threshold: a?.threshold && a.threshold > 0 ? a.threshold : START.threshold }
}

/** Whether a typed number is a rule that can be met: above zero, and whole for what is counted whole. */
export const reachable = (metric: Metric, n: number) => Number.isFinite(n) && n > 0 && (metric === 'revenue' || Number.isInteger(n))
