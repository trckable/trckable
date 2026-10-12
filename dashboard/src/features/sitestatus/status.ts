// What state a site that stopped sending visits is in, as plain functions: the
// switcher's label, the dot and the dashboard's card all read it, so they
// never disagree. Down: the server looked and the site did not answer. Quiet:
// no visits for the signals threshold, and nothing known to be wrong with the
// page. Nothing here knows about the browser.
import type { Site } from '../../lib/api'
import { tag } from '../../i18n'
import { STOPPED_HOURS } from '../signals/detect'

export type Status = 'new' | 'ok' | 'quiet' | 'down'

export function statusOf(s: Site, now = Date.now()): Status {
  const last = s.last_event_at
  if (!last) return 'new'
  if (now / 1000 - last < STOPPED_HOURS * 3600) return 'ok'
  const c = s.check
  return c && c.at > last && c.error ? 'down' : 'quiet'
}

/** Seconds as the shortest honest span: 12m, 6h, 3d. */
export function span(secs: number): string {
  const s = Math.max(0, secs)
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

/** How long since the last visit, short; empty before the first. */
export function silence(s: Site, now = Date.now()): string {
  return s.last_event_at ? span(now / 1000 - s.last_event_at) : ''
}

/** A moment as people say it: the time today, else the day and time. */
export function when(unix: number): string {
  const d = new Date(unix * 1000)
  const today = d.toDateString() === new Date().toDateString()
  return d.toLocaleString(tag, today ? { hour: '2-digit', minute: '2-digit' } : { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
