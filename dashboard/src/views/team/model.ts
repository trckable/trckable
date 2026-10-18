// The team's overview as data: one record per site, built from the sites list (its state) and the team read (its day), the totals the
// strip shows, and the order. A number the server did not give is absent here too, and every total adds the rows it is shown beside.
import type { Site } from '../../lib/api'
import type { TeamRow } from '../../lib/apiMore'
import { siteColor } from '../../components/SiteMark'
import { dotState, type DotState } from '../../features/sites/StateDot'
import { silence } from '../../features/sitestatus/time'

export interface TeamSite {
  id: string
  domain: string
  name: string
  color: string
  state: DotState
  /** How long it has been quiet or down, short ("7h"); empty otherwise. */
  silent: string
  /** The day's numbers; absent while the server has not given them (or could not read them). */
  day?: {
    online: number
    today: number
    usual?: number
    series: number[]
    topSource?: string
    revenue?: number
    currency: string
    exponent: number
  }
}

export function teamSite(site: Site, row: TeamRow | undefined, now = Date.now()): TeamSite {
  const state = dotState(site, now)
  const out: TeamSite = { id: site.id, domain: site.domain, name: site.name || site.domain, color: siteColor(site), state, silent: state === 'quiet' || state === 'stopped' ? silence(site, now) : '' }
  if (row && !row.error) {
    out.day = { online: row.online, today: row.today, usual: row.usual, series: row.series, topSource: row.top_source, revenue: row.revenue, currency: row.currency, exponent: row.exponent }
  }
  return out
}

/** Which way today stands against the usual: lower or higher by 15% or more, else steady. */
export function tone(c: number): 'low' | 'up' | '' {
  if (c <= -0.15) return 'low'
  return c >= 0.15 ? 'up' : ''
}

export type Sort = 'attention' | 'traffic' | 'change'

const ORDER: Record<DotState, number> = { stopped: 0, new: 1, quiet: 2, now: 3, live: 3 }

export const needsAttention = (s: TeamSite) => s.state === 'stopped' || s.state === 'quiet' || s.state === 'new'

/** Today against the usual as a fraction (0.31 = 31% over); null when the site has no usual yet. */
export function change(s: TeamSite): number | null {
  const d = s.day
  return d && d.usual !== undefined && d.usual > 0 ? d.today / d.usual - 1 : null
}

const todayOf = (s: TeamSite) => s.day?.today ?? -1

export function sorted(sites: TeamSite[], by: Sort): TeamSite[] {
  const out = [...sites]
  if (by === 'traffic') return out.sort((a, b) => todayOf(b) - todayOf(a))
  if (by === 'change') return out.sort((a, b) => (change(a) ?? 9) - (change(b) ?? 9) || todayOf(b) - todayOf(a))
  return out.sort((a, b) => ORDER[a.state] - ORDER[b.state] || todayOf(b) - todayOf(a))
}

/** How much of the day's visitors the sites with a usual must hold for the team to be told against it. */
const COVERS = 0.8

export interface Totals {
  online: number
  today: number
  /** Today against the usual over the sites that have a usual: both sides add the same rows, and it is told only when those rows hold most of today's visitors (a few sites with a history must not speak for the team). */
  versus: { today: number; usual: number } | null
  revenue: { minor: number; currency: string; exponent: number } | null
  attention: TeamSite[]
}

export function totals(sites: TeamSite[]): Totals {
  const read = sites.flatMap((s) => (s.day ? [s.day] : []))
  const known = read.filter((d) => d.usual !== undefined && d.usual > 0)
  const paid = read.filter((d) => d.revenue)
  const first = paid[0]
  const today = read.reduce((n, d) => n + d.today, 0)
  const knownToday = known.reduce((n, d) => n + d.today, 0)
  return {
    online: read.reduce((n, d) => n + d.online, 0),
    today,
    versus: known.length && knownToday >= today * COVERS ? { today: knownToday, usual: known.reduce((n, d) => n + (d.usual ?? 0), 0) } : null,
    // Money of one currency adds up; a team with two currencies shows none rather than a wrong sum.
    revenue: first && paid.every((d) => d.currency === first.currency) ? { minor: paid.reduce((n, d) => n + (d.revenue ?? 0), 0), currency: first.currency, exponent: first.exponent } : null,
    attention: sorted(sites.filter(needsAttention), 'attention'),
  }
}
