// What state a site that stopped sending visits is in, as plain functions: the
// switcher's label, the dot and the dashboard's card all read it, so they
// never disagree. Down: the server looked and the site did not answer. Quiet:
// no visits for the signals threshold, and nothing known to be wrong with the
// page. Nothing here knows about the browser.
import type { Site } from '../../lib/api'

/** Hours without a visit before tracking counts as stopped, as the alert of the same name says by default. */
export const STOPPED_HOURS = 6

export type Status = 'new' | 'ok' | 'quiet' | 'down'

export function statusOf(s: Site, now = Date.now()): Status {
  const last = s.last_event_at
  if (!last) return 'new'
  if (now / 1000 - last < STOPPED_HOURS * 3600) return 'ok'
  const c = s.check
  return c && c.at > last && c.error ? 'down' : 'quiet'
}

export type SiteState = 'live' | 'quiet' | 'stopped' | 'new'

const STATE = { new: 'new', down: 'stopped', quiet: 'quiet', ok: 'live' } as const

/** The status under the names the dots, pills and settings use: live, quiet (no visits, nothing known wrong), stopped (down), new. */
export function siteState(s: Site, now = Date.now()): SiteState {
  return STATE[statusOf(s, now)]
}
