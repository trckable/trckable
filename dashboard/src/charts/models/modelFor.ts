// Which model a number can wear. Money keeps its own drawing (columns, a line
// once nearly every day sells); D is visitors by channel and E a running total,
// so neither is drawn for a number that is not a count added up: they fall back
// to A.
import type { ChartModel } from './types'

export function modelFor(asked: ChartModel | null, kind = 'visitors'): ChartModel | null {
  if (!asked || kind === 'revenue' || kind === 'per-visitor') return null
  const counts = kind === 'visitors' || kind === 'pageviews'
  if (asked === 'E' && !counts) return 'A'
  if (asked === 'D' && kind !== 'visitors') return 'A'
  return asked
}
