// The bell's list as the server tells it (GET /me/notifications): one request, every site the person may read, each row with
// its own id and true time. The last list is kept in this browser for the person who read it, so the next page paints the bell at once.
import type { Milestone } from '../../lib/api'
import { more } from '../../lib/apiMore'

export interface FeedRow {
  id: string
  kind: 'down' | 'milestone' | 'busy' | 'mention' | 'answer' | 'signup' | 'sale' | 'goal' | 'alert'
  /** The site's id; empty for what is the installation's. */
  site: string
  /** Its domain, put on by this browser when it keeps the list, so a page that has not the sites yet can still word the rows. */
  domain?: string
  /** Unix seconds. */
  at: number
  /** The calendar day of what is kept by the day. */
  day?: string
  count?: number
  /** Down: when it answered again. */
  ended?: number
  amount?: number
  currency?: string
  exponent?: number
  what?: string
  visitors?: number
  factor?: number
  source?: string
  host?: string
  text?: string
  engine?: string
  first?: boolean
  /** Goal and signup: the visitor who reached it last (the journey's id) and the second they did. */
  visitor?: string
  seen?: number
  /** Goal and signup: the goal's own key (for the goals row, the one reached last). */
  goal?: string
  /** Goals: the day's goals with their counts, the one reached last first. */
  goals?: { goal: string; name?: string; count: number }[]
  /** Mention: the post's own address. */
  link?: string
  milestone?: Milestone
}

const KEY = 'trckable:bell:feed'

/** What the server answers: `partial` when a source could not be read (the list is what could be), `first` once per person. */
export interface Feed {
  notifications: FeedRow[]
  partial?: boolean
  first?: boolean
}

/** What this browser last read for this scope (the team and the sign-in); null when nothing is kept, it is another's, or nobody is known yet. */
export function loadFeed(who: string): FeedRow[] | null {
  if (!who) return null
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { who?: string; rows?: FeedRow[] } | null
    return v?.who === who && Array.isArray(v.rows) ? v.rows : null
  } catch {
    return null
  }
}

export function saveFeed(who: string, rows: FeedRow[]): void {
  if (!who) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ who, rows }))
  } catch {
    /* a blocked store only costs the instant paint */
  }
}

/** Forgets the kept list (signing out). */
export function clearFeed(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing kept to forget */
  }
}

export const readFeed = (): Promise<Feed> => more.notifications()
