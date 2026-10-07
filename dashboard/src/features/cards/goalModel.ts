// What the Goals card says about each goal: its kind (for the icon), its
// name in words, how well it converts, and the small funnel from a visit to
// the first goal. Pure, so the rules are tested on their own.

export type GoalKind = 'outbound' | 'download' | 'form' | 'custom'

/** The goals the tracker counts by itself carry fixed names; every other name was typed by the person. */
const AUTO: Record<string, GoalKind> = { outbound_click: 'outbound', file_download: 'download', form_submit: 'form' }

export const goalKind = (name: string): GoalKind => AUTO[name] ?? 'custom'

/** A conversion at or above this share of visitors reads as converting; below it, barely used. */
export const CONVERTING_FROM = 0.005

export type GoalStatus = 'converting' | 'barely'

export const goalStatus = (conversion: number): GoalStatus => (conversion >= CONVERTING_FROM ? 'converting' : 'barely')

/** Visitors who stayed past a bounce, from the period's bounce rate; null when the report has none. */
export function engagedOf(visitors: number, bounceRate: number | undefined): number | null {
  if (bounceRate === undefined || !Number.isFinite(bounceRate) || visitors <= 0) return null
  return Math.round(visitors * (1 - Math.min(1, Math.max(0, bounceRate))))
}

export interface FunnelStep {
  key: 'visitors' | 'engaged' | 'goal'
  value: number
  /** Width of the bar, 0 to 100, against the first step. */
  width: number
}

/** Visitors → Engaged → the goal; null unless there is engaged data and it holds together (each step no bigger than the one before). */
export function goalFunnel(visitors: number, engaged: number | null, reached: number): FunnelStep[] | null {
  if (engaged === null || engaged <= 0 || visitors <= 0 || engaged > visitors || reached > engaged) return null
  const w = (n: number) => Math.max(2, Math.round((n / visitors) * 100))
  return [
    { key: 'visitors', value: visitors, width: 100 },
    { key: 'engaged', value: engaged, width: w(engaged) },
    { key: 'goal', value: reached, width: reached > 0 ? w(reached) : 0 },
  ]
}
