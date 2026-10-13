// The rules the three All sites designs share: which sites come first, who
// moved most, and the greeting. Pure, so the designs only draw.
import { statusOf } from '../features/sitestatus/status'
import type { Site, SiteRow } from '../lib/api'

export type Design = 'a' | 'b' | 'c'

/** ?design=a|b|c on /all; anything else is the page as it is. */
export function designOf(search: string): Design | null {
  const d = new URLSearchParams(search).get('design')
  return d === 'a' || d === 'b' || d === 'c' ? d : null
}

/** Down first, then quiet, then the rest. */
const TROUBLE = { down: 0, quiet: 1, ok: 2, new: 2 }
const trouble = (s: Site | undefined, now: number) => TROUBLE[s ? statusOf(s, now) : 'ok']

/** Down, then quiet, then the most people online, then the most visitors. */
export function wallOrder(rows: SiteRow[], sites: Site[], now = Date.now()): SiteRow[] {
  const by = new Map(sites.map((s) => [s.id, s]))
  return [...rows].sort((a, b) => trouble(by.get(a.id), now) - trouble(by.get(b.id), now) || b.online - a.online || b.visitors - a.visitors)
}

export interface Totals {
  visitors: number
  previous: number
  online: number
  onlineSites: number
}

/** What the sites that could be read add up to. */
export function sumOf(rows: SiteRow[]): Totals {
  const ok = rows.filter((r) => !r.error)
  return {
    visitors: ok.reduce((a, r) => a + r.visitors, 0),
    previous: ok.reduce((a, r) => a + r.previous_visitors, 0),
    online: ok.reduce((a, r) => a + r.online, 0),
    onlineSites: ok.filter((r) => r.online > 0).length,
  }
}

/** The site that moved most against the period before, up or down; null when nothing moved or no site has a before. */
export function biggestMove(rows: SiteRow[]): { row: SiteRow; by: number } | null {
  let best: { row: SiteRow; by: number } | null = null
  for (const r of rows) {
    if (r.error || !(r.previous_visitors > 0)) continue
    const by = r.visitors - r.previous_visitors
    if (by !== 0 && (!best || Math.abs(by) > Math.abs(best.by))) best = { row: r, by }
  }
  return best
}

/** The greeting for the hour of the viewer's day. */
export function partOfDay(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning'
  return hour < 18 ? 'afternoon' : 'evening'
}
