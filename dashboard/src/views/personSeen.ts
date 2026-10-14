// A person's last sign-in on their People row, in words.
import type { Person } from '../lib/api'
import { relativeAgo } from '../lib/format'

/** A person's last sign-in, or why there is none. */
export function seenText(p: Person): string {
  if (p.must_change) return 'Has not chosen a password yet'
  return p.last_seen ? `Last seen ${relativeAgo(p.last_seen)}` : 'Never signed in'
}
