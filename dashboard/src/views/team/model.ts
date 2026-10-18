// The team's overview, as data: one record per site, what the page says about the day, and the order.
export type TeamStatus = 'ok' | 'down' | 'quiet' | 'unverified' | 'new'

export interface TeamSite {
  id: string
  name: string
  color: string
  status: TeamStatus
  /** How long, or since when, in plain words: "23 min", "since 11:40". Only for a status that is not fine. */
  note?: string
  online: number
  today: number
  /** What this hour of a usual day brings; absent while there is too little history to say. */
  usual?: number
  /** Visitors per bucket, oldest first; absent when nothing has been counted. */
  series?: number[]
  topSource?: string
  /** Revenue today, minor units; absent when the site has no payments. */
  revenue?: number
  currency: string
  exponent: number
}

/** Which way today stands against the usual: lower or higher by 15% or more, else steady. */
export function tone(c: number): 'low' | 'up' | '' {
  if (c <= -0.15) return 'low'
  return c >= 0.15 ? 'up' : ''
}

export type Sort = 'attention' | 'traffic' | 'change'

const ORDER: Record<TeamStatus, number> = { down: 0, unverified: 1, quiet: 2, new: 3, ok: 4 }

export const needsAttention = (s: TeamSite) => s.status === 'down' || s.status === 'quiet' || s.status === 'unverified'

/** Today against the usual, as a fraction (0.31 = 31% over); null when the site has no usual yet. */
export function change(s: TeamSite): number | null {
  return s.usual && s.usual > 0 ? s.today / s.usual - 1 : null
}

export function sorted(sites: TeamSite[], by: Sort): TeamSite[] {
  const out = [...sites]
  if (by === 'traffic') return out.sort((a, b) => b.today - a.today)
  if (by === 'change') return out.sort((a, b) => (change(a) ?? -9) - (change(b) ?? -9))
  return out.sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.today - a.today)
}

export interface Totals {
  online: number
  today: number
  usual: number | null
  revenue: { minor: number; currency: string; exponent: number } | null
  attention: TeamSite[]
}

export function totals(sites: TeamSite[]): Totals {
  const known = sites.filter((s) => s.usual !== undefined)
  const paid = sites.filter((s) => s.revenue)
  const first = paid[0]
  return {
    online: sites.reduce((n, s) => n + s.online, 0),
    today: sites.reduce((n, s) => n + s.today, 0),
    usual: known.length ? known.reduce((n, s) => n + (s.usual ?? 0), 0) : null,
    // Money of one currency adds up; a team with two currencies shows none rather than a wrong sum.
    revenue: first && paid.every((s) => s.currency === first.currency) ? { minor: paid.reduce((n, s) => n + (s.revenue ?? 0), 0), currency: first.currency, exponent: first.exponent } : null,
    attention: sorted(sites.filter(needsAttention), 'attention'),
  }
}
