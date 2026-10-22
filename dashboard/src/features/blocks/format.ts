// A block's number in words, by the one rule of the page it came from.
import { fmtCompact, fmtDuration, fmtFixed, fmtInt, fmtMoney } from '../../lib/format'
import type { Delta } from '../../lib/format'
import type { Amount } from './types'

export function amountText(n: number, a: Amount): string {
  switch (a.unit) {
    case 'percent':
      return `${fmtFixed(n, n >= 10 || n === 0 ? 0 : 1)}%`
    case 'money':
      return fmtMoney(n, a.currency ?? 'USD', a.exponent ?? 2)
    case 'duration':
      return fmtDuration(n)
    case 'ms':
      return `${fmtInt(n)} ms`
    default:
      return fmtCompact(n)
  }
}

/** The colour of a change: a lower-is-better number reads by whether the move was the better one. */
export const toneOf = (d: Delta): 'up' | 'down' | 'flat' => {
  if (d.verdict === 'better') return 'up'
  if (d.verdict === 'worse') return 'down'
  return d.tone
}
