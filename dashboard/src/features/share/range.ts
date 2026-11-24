// The days a custom period may take, and what is wrong with a pair that is not one: the card is drawn for days that
// exist (up to today, from the site's first data), and the server reads the same bounds again.
import { addDays, diffDays, type ISODate } from '../../lib/dates'

export type Problem = 'future' | 'early' | 'order' | 'missing'

/** What is wrong with a range of days, or null when it can be drawn. `first` is the site's first day of data, when known. */
export function rangeProblem(from: string, to: string, today: ISODate, first?: string): Problem | null {
  if (!from || !to) return 'missing'
  if (from > today || to > today) return 'future'
  if (first && (from < first || to < first)) return 'early'
  if (from > to) return 'order'
  return null
}

/** The range the picker opens on: the last 30 days, no earlier than the first day of data. */
export function openRange(today: ISODate, first?: string): { from: ISODate; to: ISODate } {
  const from = addDays(today, -29)
  return { from: first && from < first && diffDays(first, today) >= 0 ? first : from, to: today }
}
