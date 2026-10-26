// The period and the comparison, switched from right over the chart. They write what the header's period menu writes (the
// same view patch, so the address, the chip and the chart cannot disagree); this only names the few choices that fit a row.
import type { ViewState } from '../../lib/url'
import type { CompareChoice } from './PeriodChip'

/** The periods a row over the chart offers; the rest stay in the header's menu. */
export const CHART_PERIODS = ['7d', '30d', '90d', '12mo'] as const

/** What picking a period writes: it clears the dates, the cut and the day the page was on. The header's menu writes the same. */
export const periodPatch = (id: string): Partial<ViewState> => ({ period: id, from: undefined, to: undefined, bucket: undefined, day: undefined })

/** The comparisons the picker beside the switch offers. */
export const AGAINST = ['previous', 'year'] as const
export type Against = (typeof AGAINST)[number]

/** The switch turns the comparison on (against the period before) or off. */
export const switchPatch = (on: boolean): Partial<ViewState> => ({ compare: on ? 'previous' : 'none' })

export const isOn = (c: CompareChoice): boolean => c !== 'none'

/** Arrow keys move through a row of choices and wrap; Home and End go to its ends. -1 when the key is not one of them. */
export function stepOf(key: string, at: number, n: number): number {
  if (key === 'ArrowRight' || key === 'ArrowDown') return (at + 1) % n
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (at - 1 + n) % n
  if (key === 'Home') return 0
  if (key === 'End') return n - 1
  return -1
}
