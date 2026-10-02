// The last visit, per person (this browser) and site, and whether the card for
// today was put away. Opening the Data view rolls the record: the first open of
// a day makes the last day seen "before", so a reload the same day still
// reads "since" the same time, and a card put away stays put away until
// tomorrow. Pure over a store, so it is tested: visit.test.ts.
import { addDays } from '../../lib/dates'
import { read, write } from './store'

export interface Seen {
  /** The day before today's visit that the person was last here. */
  prev?: string
  /** The latest day they were here. */
  cur: string
  /** The day the card was put away. */
  gone?: string
  /** The day the card was shown: the other cards keep out of that day. */
  shown?: string
  /** What the card has said lately, so the same finding is not told again day after day. */
  told?: { id: string; day: string }[]
}

/** A finding is told again after this many days (if it still stands). */
export const TELL_AGAIN_DAYS = 7

const key = (site: string) => `trckable:today:${site}`

/** The record as it stands on `today`, rolled when it is a new day. */
export function roll(saved: Seen | null, today: string): Seen {
  if (!saved) return { cur: today }
  if (saved.cur === today) return saved
  return { prev: saved.cur, cur: today, told: saved.told }
}

/** The ids told on an earlier day within the last week (today's are still on the card). */
export const toldLately = (s: Seen, today: string) => (s.told ?? []).filter((t) => t.day < today && t.day > addDays(today, -TELL_AGAIN_DAYS)).map((t) => t.id)

export function visitOf(site: string, today: string): Seen {
  const now = roll(read<Seen | null>(key(site), null), today)
  write(key(site), now)
  return now
}

export const putAway = (site: string, today: string) => write(key(site), { ...visitOf(site, today), gone: today })
/** The card was shown with these findings. */
export function markShown(site: string, today: string, ids: string[]) {
  const seen = visitOf(site, today)
  const lately = (seen.told ?? []).filter((t) => t.day > addDays(today, -TELL_AGAIN_DAYS) && !ids.includes(t.id))
  write(key(site), { ...seen, shown: today, told: [...lately, ...ids.map((id) => ({ id, day: today }))].slice(-12) })
}
