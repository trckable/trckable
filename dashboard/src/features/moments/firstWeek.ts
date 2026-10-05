// The guide cards: leaving your own visits out (on the first day with
// traffic only), the first AI visitor or crawler, turning on AI crawlers once
// an assistant has sent a visitor, then Replay, Full, the weekly
// email and Search Console. At most one a day, in that order, never for
// something already used or set up, and none again once put away or acted on.
// Only the two AI ones are for a site past its first seven days.
// What is remembered is per site (what was put away and today's pick) in this
// browser (store.ts). Pure over what the caller knows: firstWeek.test.ts.
import { read, write } from './store'

export type CardId = 'exclude' | 'ai' | 'crawlers' | 'replay' | 'full' | 'weekly' | 'search'
export const ORDER: CardId[] = ['exclude', 'ai', 'crawlers', 'replay', 'full', 'weekly', 'search']

/** A site's first week, in seconds. */
export const FIRST_WEEK_S = 7 * 86400

export const inFirstWeek = (createdAt: number | undefined, nowS: number) => !!createdAt && nowS - createdAt < FIRST_WEEK_S

export interface Known {
  /** Replay was played, Full was opened (by this person, anywhere). */
  replayed: boolean
  fullOpened: boolean
  /** The weekly email is on, or has been put away from the first screen. */
  weekly: boolean
  /** Search Console is connected. */
  search: boolean
  /** Whether to ask about leaving your own visits out: the first day this
   *  browser saw traffic for the site, and the browser is not already left out. */
  exclude: boolean
  /** An AI assistant has sent a visitor, or an AI crawler has read the site. */
  ai: boolean
  /** An AI assistant has sent a visitor while the AI crawlers module is off: the one fact that fits turning it on. */
  crawlers: boolean
  /** The site is in its first week: the cards about getting started. */
  fresh: boolean
}

export interface Kept {
  /** Cards put away or acted on, for good. */
  done: CardId[]
  /** The first day this browser saw traffic for the site. */
  traffic?: string
  /** Today's pick: the same card until it is put away. */
  day?: string
  id?: CardId
}

/** The cards not yet needed, in the order they come. */
export function eligible(k: Known, kept: Kept): CardId[] {
  const skip: Record<CardId, boolean> = { exclude: !k.exclude, ai: !k.ai, crawlers: !k.crawlers, replay: k.replayed, full: k.fullOpened, weekly: k.weekly, search: k.search }
  return ORDER.filter((id) => !skip[id] && !kept.done.includes(id) && (k.fresh || id === 'ai' || id === 'crawlers'))
}

/** The one card for `today`: the one already picked today if it still stands, else the first eligible. None when nothing is left. */
export function pick(k: Known, kept: Kept, today: string): CardId | null {
  const left = eligible(k, kept)
  if (kept.day === today && kept.id) return left.includes(kept.id) ? kept.id : null
  return left[0] ?? null
}

/** The day to ask on: the first this browser saw traffic, remembered from then on. */
export function trafficDay(site: string, today: string): string {
  const kept = keptOf(site)
  if (kept.traffic) return kept.traffic
  remember(site, { ...kept, traffic: today })
  return today
}

const key = (site: string) => `trckable:disc:${site}`
export const keptOf = (site: string): Kept => read<Kept>(key(site), { done: [] })
export const remember = (site: string, k: Kept) => write(key(site), k)
