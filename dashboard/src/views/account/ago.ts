// "2 h ago" for a time in unix seconds.
import { keys } from './keysCopy'

export function ago(unix: number, now = Date.now() / 1000): string {
  const s = Math.max(0, now - unix)
  if (s < 60) return keys.ago.now
  if (s < 3600) return keys.ago.minutes(Math.round(s / 60))
  if (s < 86400) return keys.ago.hours(Math.round(s / 3600))
  const d = Math.round(s / 86400)
  return d === 1 ? keys.ago.yesterday : keys.ago.days(d)
}
