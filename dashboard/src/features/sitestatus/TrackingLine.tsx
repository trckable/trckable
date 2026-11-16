// One quiet line about tracking itself, under what the uptime probe says of the page: visits are arriving (tracking works), or
// when they stopped. The decision is trackingOf (status.ts); this only words it.
import type { Site } from '../../lib/api'
import { plainSpan } from '../../lib/plainSpan'
import { copy } from './copy'
import { trackingOf } from './status'
import { when } from './time'

export function TrackingLine({ site, now, className = 'tracking-line' }: { site: Pick<Site, 'last_event_at' | 'timezone'>; now?: number; className?: string }) {
  const t = trackingOf(site, now)
  if (!t) return null
  return (
    <p className={className} data-tracking={t.kind}>
      {t.kind === 'works' ? copy.trackingWorks(plainSpan(t.ago)) : copy.sinceVisit(when(t.at, site.timezone))}
    </p>
  )
}
