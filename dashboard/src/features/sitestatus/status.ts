// What state a site that stopped sending visits is in, as plain functions: the
// switcher's label, the dot and the dashboard's card all read it, so they
// never disagree. Down: the server looked and the site did not answer. Quiet:
// no visits for the signals threshold, and nothing known to be wrong with the
// page. Nothing here knows about the browser.
import type { Site } from '../../lib/api'

/** Hours without a visit before tracking counts as stopped, as the alert of the same name says by default. */
export const STOPPED_HOURS = 6

export type Status = 'new' | 'ok' | 'quiet' | 'down'

/** The script was seen on the page, or a payment/snippet source verified: the site is set up, whatever its visits say. */
function scriptSeen(s: Site): boolean {
  return s.check?.found === 'site' || !!s.verified?.sources.some((v) => v.kind === 'snippet' && v.ok)
}

export function statusOf(s: Site, now = Date.now()): Status {
  if (s.down_since) return 'down' // the uptime probe: some visitors may still get through, the site is down for our checks
  const last = s.last_event_at
  if (!last) return scriptSeen(s) ? 'quiet' : 'new' // imported history or a working script with no live visit yet is not "not installed"
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

/** Sites that went quiet and still matter: no visits for the stopped threshold, not down, and seen within 30 days (older ones are dormant). The footer and the Sites page's Uptime note both count these, so they say the same number. */
export function quietSites(sites: Site[], now = Date.now()): Site[] {
  return sites.filter((s) => statusOf(s, now) === 'quiet' && !!s.last_event_at && now / 1000 - s.last_event_at <= 30 * 86400)
}
