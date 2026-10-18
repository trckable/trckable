// A site's quiet spell in words: how long, and since when. Only the switcher's
// list and the card write these, so the first screen does not carry them.
import type { Site } from '../../lib/api'
import { tag } from '../../i18n'
import { clock } from '../../lib/site'

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

/** A moment as people say it: the time today, else the day and time. Times are 24 hours, as everywhere in the app. */
export function when(unix: number): string {
  const d = new Date(unix * 1000)
  const today = d.toDateString() === new Date().toDateString()
  if (today) return clock(d, '')
  return `${d.toLocaleDateString(tag, { weekday: 'short', day: 'numeric', month: 'short' })}, ${clock(d, '')}`
}
