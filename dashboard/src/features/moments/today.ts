// "One thing today": what matters most since the last visit, up to three.
// Takes the pins of the window since then (the same ones the chart's markers
// are made of), drops what is too small to be news, keeps the best of each
// kind and ranks them. Pure: today.test.ts.
import { addDays, type ISODate } from '../../lib/dates'
import { byScore, type Pin, type PinKind } from './pins'

/** A spike under this many visitors is a quiet site's chance, not news: the insights' own floor for a source. */
export const MIN_SPIKE_VISITORS = 100
/** At most this many, one after the other. */
export const MAX_ITEMS = 3
/** A visit's window is at least a week (a day alone is too little to say anything) and at most a month. */
const MIN_DAYS = 7
const MAX_DAYS = 30

/** What the card speaks of: not an AI assistant's first visit (it is the first of the window, not of all time) and not a milestone (its own banner says it). */
const KINDS: PinKind[] = ['drop', 'spike', 'move', 'pays', 'sale', 'referrer']

/** The days to look at: back to the last visit, never fewer than a week nor more than a month. */
export function windowOf(since: ISODate | undefined, today: ISODate): { from: ISODate; to: ISODate } {
  const earliest = addDays(today, 1 - MAX_DAYS)
  const week = addDays(today, 1 - MIN_DAYS)
  const from = since && since < week ? since : week
  return { from: from < earliest ? earliest : from, to: today }
}

/** `told`: the ids said lately, which are not said again. */
export function pickToday(pins: Pin[], since?: ISODate, told: string[] = []): Pin[] {
  const best = new Map<PinKind, Pin>()
  for (const p of [...pins].sort(byScore)) {
    if (!KINDS.includes(p.kind) || best.has(p.kind) || told.includes(p.id)) continue
    if (p.kind === 'spike' && (p.n.visitors ?? 0) < MIN_SPIKE_VISITORS) continue
    // A finding with a day only counts if it came after the last visit.
    if (since && p.day && p.day <= since) continue
    best.set(p.kind, p)
  }
  return [...best.values()].sort(byScore).slice(0, MAX_ITEMS)
}
