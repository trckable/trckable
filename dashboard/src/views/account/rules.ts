// Who may change whose role, and how a viewer's sites read on their row.
// Plain functions, so the rules are tested without a screen.
import type { Person } from '../../lib/api'

export type RoleLock = 'self' | 'last' | null

/** Why a person's role control is off, or null when it can be used: yourself
 *  (another owner changes your role) and the only owner (the instance would
 *  be left with none). */
export function roleLock(p: Pick<Person, 'email' | 'role'>, me: string | undefined, owners: number): RoleLock {
  if (p.email === me) return 'self'
  if (p.role === 'owner' && owners <= 1) return 'last'
  return null
}

export interface SiteChips {
  /** No limit: every site. */
  all: boolean
  /** Limited to nothing at all. */
  none: boolean
  names: string[]
  /** How many more sites there are than names shown. */
  more: number
}

/** The sites a viewer may see as chips: everything, or up to `max` names and
 *  a "+N" for the rest. Sites that no longer exist are left out. */
export function siteChips(allowed: string[] | null, sites: { id: string; domain: string; name: string }[], max = 3): SiteChips {
  if (allowed === null) return { all: true, none: false, names: [], more: 0 }
  const known = sites.filter((s) => allowed.includes(s.id)).map((s) => s.name || s.domain)
  return { all: false, none: known.length === 0, names: known.slice(0, max), more: Math.max(0, known.length - max) }
}
