// Who must set a site up before anything else. An owner needs one site that
// has had its first visit; until then every address is the first run (add the
// site, install it, wait for the first visit). One verified site among several
// is enough. A viewer is never held for this: with nothing shared with them
// they see that, read-only.
import type { Site } from './api'

export function needsFirstRun(sites: Pick<Site, 'last_event_at'>[], owner: boolean): boolean {
  return owner && !sites.some((s) => !!s.last_event_at)
}
