// What needs the owner on All sites, from what the dashboard already knows:
// a site's status (features/sitestatus/status.ts, the same rule as the badge
// and the switcher's dot) and the busy moment the server finds (/surge).
// Most important first: down, then quiet, then busier than usual. Nothing here
// guesses a cause; the panel a button opens says what was checked.
import type { Surge } from '../features/signals/surge'
import { statusOf } from '../features/sitestatus/status'
import type { Site } from '../lib/api'

export const MAX_NEEDS = 3

export type Need = { kind: 'down'; site: Site } | { kind: 'quiet'; site: Site } | { kind: 'surge'; site: Site; surge: Surge }

const RANK = { down: 0, quiet: 1, surge: 2 }

export function needsOf(sites: Site[], surges: Map<string, Surge>, now = Date.now()): Need[] {
  const out: Need[] = []
  for (const site of sites) {
    const status = statusOf(site, now)
    if (status === 'down' || status === 'quiet') out.push({ kind: status, site })
    else if (status === 'ok') {
      const surge = surges.get(site.id)
      if (surge && !surge.ended) out.push({ kind: 'surge', site, surge })
    }
  }
  return out.sort((a, b) => RANK[a.kind] - RANK[b.kind]).slice(0, MAX_NEEDS)
}

/** A silence in words: "12 minutes", "6 hours", "3 days". */
export function longSpan(secs: number): string {
  const s = Math.max(0, secs)
  const one = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`
  if (s < 3600) return one(Math.max(1, Math.round(s / 60)), 'minute')
  if (s < 86400) return one(Math.floor(s / 3600), 'hour')
  return one(Math.floor(s / 86400), 'day')
}
