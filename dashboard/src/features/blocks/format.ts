// A block's number in words, by the one rule of the page it came from.
import { browserZone, fmtCompact, fmtDuration, fmtFixed, fmtInt, fmtMoney } from '../../lib/format'
import type { Delta } from '../../lib/format'
import { fmtDay, todayIn } from '../../lib/dates'
import { copy } from './copy'
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

/** A chart's first or last point as the dashboard says days: "Oct 20", "Today", "Now" (an hourly point is its hour), never the raw timestamp the server names it by. */
export function axisLabel(raw: string, last: boolean, now = new Date()): string {
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):\d{2})?/.exec(raw)
  if (!m) return raw
  const today = m[1] === todayIn(browserZone(), now)
  if (m[2] !== undefined) return last && today ? copy.now : `${m[2]}:00`
  return last && today ? copy.today : fmtDay(m[1])
}
