// PROTOTYPE DATA, not real: the All sites directions (?design=1|2|3) show an
// Uptime lens and a revenue trend before the server keeps either. Incident
// history does not exist yet, so each site's days are made up here from its id
// (and bent to match what is true now: a site that is down is red today, a
// quiet one amber). The revenue trend and its change spread the period's real
// revenue over the visitors' days. Nothing here may reach real copy or claims.
import { statusOf } from '../features/sitestatus/status'
import type { Site, SiteRow } from '../lib/api'

export type DayState = 'ok' | 'quiet' | 'down' | 'none'

const hash = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) % 1000
}

export interface Uptime {
  days: DayState[]
  /** Share of the period the site answered, 0 to 100. */
  pct: number
  incidents: number
  downMinutes: number
}

export function uptimeOf(row: SiteRow, site: Site | undefined, now = Date.now()): Uptime {
  const n = row.series?.length ?? 30
  const status = site ? statusOf(site, now) : 'ok'
  const days: DayState[] = []
  const minutes: number[] = []
  for (let d = 0; d < n; d++) {
    const x = hash(row.id + ':' + d)
    const ago = n - 1 - d
    let s: DayState = x < 25 ? 'down' : x < 70 ? 'quiet' : 'ok'
    let m = s === 'down' ? 20 + (x % 160) : 0
    if (status === 'new') s = 'none'
    if (status === 'down' && ago < 2) [s, m] = ['down', 1440]
    if (status === 'quiet' && ago < 3) [s, m] = ['quiet', 0]
    if (status === 'ok' && ago === 0) [s, m] = ['ok', 0]
    days.push(s)
    minutes.push(s === 'none' ? 0 : m)
  }
  const downMinutes = minutes.reduce((a, b) => a + b, 0)
  const incidents = days.filter((s, i) => s === 'down' && days[i - 1] !== 'down').length
  return { days, pct: status === 'new' ? 100 : 100 - (downMinutes / (n * 1440)) * 100, incidents, downMinutes }
}

/** The period's revenue spread over the visitors' days, and what it would have been before at the same rate per visitor. */
export function revenueTrend(row: SiteRow): { series: number[]; previous: number } | null {
  if (row.revenue === undefined || row.error || !row.series || row.visitors <= 0) return null
  const per = row.revenue / row.visitors
  return { series: row.series.map((v) => v * per), previous: per * row.previous_visitors }
}
