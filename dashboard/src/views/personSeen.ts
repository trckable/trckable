// A person's last sign-in on their People row, in words.
import type { Person } from '../lib/api'

function seen(unix: number): string {
  const s = Math.max(0, Date.now() / 1000 - unix)
  if (s < 3600) return 'within the hour'
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  const d = Math.round(s / 86400)
  return d === 1 ? 'yesterday' : `${d} days ago`
}

/** A person's last sign-in, or why there is none. */
export function seenText(p: Person): string {
  if (p.must_change) return 'Has not chosen a password yet'
  return p.last_seen ? `Last seen ${seen(p.last_seen)}` : 'Never signed in'
}
