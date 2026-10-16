// A site's state as a dot beside its mark. Pulsing green: a visit in the last
// five minutes (the server records the latest visit at most a minute late);
// green: visits lately; amber: no visits for hours and the page answers;
// red: the site is down; hollow: never seen (features/sitestatus/status.ts).
// It reads the sites list the dashboard already has: no query of its own.
import type { Site } from '../../lib/api'
import { siteState, type SiteState } from '../sitestatus/status'
import { copy } from './copy'

export type DotState = SiteState | 'now'

/** Within this long of the last visit, the site counts as visited right now. */
const NOW_S = 300

export function dotState(s: Site, now = Date.now()): DotState {
  if (siteState(s, now) === 'stopped') return 'stopped' // a site that fails is never shown as fine, visits or not
  if (s.last_event_at && now / 1000 - s.last_event_at < NOW_S) return 'now'
  return siteState(s, now)
}

export function StateDot({ site }: { site: Site }) {
  const state = dotState(site)
  return <span className={'dot state-dot ' + state} aria-hidden="true" title={copy.dot[state]} />
}
