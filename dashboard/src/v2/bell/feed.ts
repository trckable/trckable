// The bell's list as the server tells it (GET /me/notifications): one request, every site the person may read, each row with
// its own id and true time. The last list is kept in this browser for the account (its sites), so the next page paints the bell at once.
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
  milestone?: Milestone
}

const KEY = 'trckable:bell:feed'

/** What this browser last read, for the account it was read for (named by its sites); null when nothing is kept or it is another account's. With no account named, whatever is kept stands in until the sites are known. */
export function loadFeed(account: string | null): FeedRow[] | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { account?: string; rows?: FeedRow[] } | null
    return v && (account === null || v.account === account) && Array.isArray(v.rows) ? v.rows : null
  } catch {
    return null
  }
}

export function saveFeed(account: string, rows: FeedRow[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ account, rows }))
  } catch {
    /* a blocked store only costs the instant paint */
  }
}

export const readFeed = (): Promise<FeedRow[]> => more.notifications().then((r) => r.notifications)
