// The Google path on What changed: Shown, Clicked and Arrived. Google's two numbers run 2 to 3 days behind, so they are read
// for the last complete days that cover as many days as the page's period; Arrived is our own count for the period itself.
import type { Row } from '../../lib/api'
import { addDays, diffDays } from '../../lib/dates'

/** How far Google's newest complete day trails today. */
export const LAG_DAYS = 3

export interface Seen {
  shown: number
  clicked: number
}

export interface Path extends Seen {
  arrived: number
}

const GOOGLE = /^(www\.)?google\.[a-z.]+$/

/** A source row that is Google, in any of its country sites. */
export const isGoogle = (value: string): boolean => GOOGLE.test(value)

/** The days Google's two numbers are read for: as long as the period, ending where the period ends or at Google's newest complete day. */
export function seenWindow(range: { from: string; to: string }, today: string): { from: string; to: string } {
  const to = range.to < addDays(today, -LAG_DAYS) ? range.to : addDays(today, -LAG_DAYS)
  return { from: addDays(to, -diffDays(range.from, range.to)), to }
}

/** Our people from Google in the period: every Google site among the sources, added up. */
export const arrivedOf = (sources: Row[] | null | undefined): number => (sources ?? []).filter((r) => isGoogle(r.value)).reduce((n, r) => n + r.visitors, 0)

/** The three numbers, or nothing where Search Console is not connected or sent nothing back. */
export function pathOf(seen: Seen | null | undefined, sources: Row[] | null | undefined): Path | null {
  if (!seen) return null
  return { ...seen, arrived: arrivedOf(sources) }
}
