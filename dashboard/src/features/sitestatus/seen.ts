// The sites list is read when the dashboard opens, so a site's last_event_at can be days old while visitors are on it right now. Every surface that shows
// someone online tells it here, and lastEventOf then takes the newer of the two: a site with a visitor is never quiet, whatever the list says.
import type { Site } from '../../lib/api'

const seen = new Map<string, number>()

/** A visit or a visitor online on this site, at `at` (unix seconds; now by default). */
export function noteVisit(id: string, at = Date.now() / 1000) {
  if (at > (seen.get(id) ?? 0)) seen.set(id, at)
}

/** The site's latest visit in unix seconds: the list's, or a newer one this tab has seen. Undefined before any. */
export function lastEventOf(s: Pick<Site, 'id' | 'last_event_at'>): number | undefined {
  const at = Math.max(s.last_event_at ?? 0, seen.get(s.id) ?? 0)
  return at || undefined
}

/** For tests: forget what this tab has seen. */
export const forgetVisits = () => seen.clear()
