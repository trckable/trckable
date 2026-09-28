// A site's state as a dot beside its mark. Pulsing green: a visit in the last
// five minutes (the server records the latest visit at most a minute late);
// green: visits today; amber: gone quiet; red: stopped; hollow: never seen.
// It reads the sites list the dashboard already has: no query of its own.
import { siteState, type Site, type SiteState } from '../../lib/api'
import { copy } from './copy'

export type DotState = SiteState | 'now'

/** Within this long of the last visit, the site counts as visited right now. */
const NOW_S = 300

export function dotState(s: Site, now = Date.now()): DotState {
  if (s.last_event_at && now / 1000 - s.last_event_at < NOW_S) return 'now'
  return siteState(s)
}

export function StateDot({ site }: { site: Site }) {
  const state = dotState(site)
  return <span className={'dot state-dot ' + state} aria-hidden="true" title={copy.dot[state]} />
}
