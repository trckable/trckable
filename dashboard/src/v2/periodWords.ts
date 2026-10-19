// The words the period pill says about the comparison, and whether Last year can be offered.
import { compareLabel, type Range } from '../lib/dates'
import type { ViewState } from '../lib/url'
import { copy } from './copy'

/** What the pill says the numbers are set against: always what the menu has selected. A day's "before" is the site's usual for that weekday. */
export function vsWords(day: boolean, weekday: string, view: ViewState, range: Range): string | undefined {
  if (view.compare === 'none') return undefined
  if (day && view.compare === 'previous') return copy.vsUsual(weekday)
  return copy.vsLabel(compareLabel(view.period, view.compare, range))
}

/** Last year's comparison needs a year of data: the site is at least that old. */
export const hasYear = (site: { created_at?: number }, nowSec = Math.floor(Date.now() / 1000)): boolean => !!site.created_at && nowSec - site.created_at >= 365 * 86400
