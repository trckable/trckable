// The period a dialog tells its story for: the one the dashboard is on, as a
// range (without its filters, so the numbers are the site's own), and as words.
import type { ReportQuery } from '../../lib/api'
import { rangeOf } from '../../lib/dashQuery'
import { fmtRange, todayIn } from '../../lib/dates'
import { readView } from '../../lib/url'

export interface Period {
  query: ReportQuery
  /** "Sep 5 – Oct 4", for the dialog's head. */
  text: string
}

export function periodOf(timezone: string): Period {
  const today = todayIn(timezone)
  const range = rangeOf(readView(new URLSearchParams(location.search)), today)
  return { query: { from: range.from, to: range.to, daily: range.from !== range.to }, text: fmtRange(range, today) }
}
