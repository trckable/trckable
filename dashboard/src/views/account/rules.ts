// Who may change whose role, the order of the list, and how a viewer's sites
// read on their row.
// Plain functions, so the rules are tested without a screen.
import type { Person } from '../../lib/api'

export type RoleLock = 'self' | 'last' | null

/** Why a person's role control is off, or null when it can be used: the only
 *  owner (the instance would be left with none) and yourself (another owner
 *  changes your role). The only owner is named first: it says more. */
export function roleLock(p: Pick<Person, 'email' | 'role'>, me: string | undefined, owners: number): RoleLock {
  if (p.role === 'owner' && owners <= 1) return 'last'
  if (p.email === me) return 'self'
  return null
}

/** You first, then the owners, then the viewers; the ones who were here most
 *  recently first inside each. */
export function orderPeople<T extends Pick<Person, 'email' | 'role' | 'last_seen'>>(list: T[], me: string | undefined): T[] {
  const rank = (p: T) => {
    if (p.email === me) return 0
    return p.role === 'owner' ? 1 : 2
  }
  return [...list].sort((x, y) => rank(x) - rank(y) || (y.last_seen || 0) - (x.last_seen || 0))
}

type Site = { id: string; domain: string; name: string }

export interface SitesSummary<S extends Site> {
  /** No limit: every site. */
  all: boolean
  /** Limited to nothing at all. */
  none: boolean
  /** How many sites may be seen, out of `total`. */
  count: number
  total: number
  /** The first few sites, for the small icon stack. */
  marks: S[]
}

/** A person's sites for their row: everything (an owner, or a viewer with no
 *  limit), or the ticked ones. Sites that no longer exist are left out. */
export function sitesSummary<S extends Site>(allowed: string[] | null, sites: S[], max = 3): SitesSummary<S> {
  const known = allowed === null ? sites : sites.filter((s) => allowed.includes(s.id))
  return { all: allowed === null, none: known.length === 0, count: known.length, total: sites.length, marks: known.slice(0, max) }
}

/** The list after one site is ticked or unticked; no limit counts as every site ticked. */
export function toggledSites(allowed: string[] | null, sites: { id: string }[], id: string): string[] {
  const now = allowed === null ? sites.map((s) => s.id) : allowed
  return now.includes(id) ? now.filter((x) => x !== id) : [...now, id]
}

/** The sites a search finds, by name or domain. */
export function findSites<S extends Site>(sites: S[], query: string): S[] {
  const q = query.trim().toLowerCase()
  return q ? sites.filter((s) => s.domain.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)) : sites
}
