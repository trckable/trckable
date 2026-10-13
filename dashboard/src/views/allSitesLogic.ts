// The rules of the All sites screen, apart from how it looks: where the
// sparklines start and which site comes first.
import { statusOf } from '../features/sitestatus/status'
import type { Site, SiteRow } from '../lib/api'

/** The first point of the shared x range: the earliest day with a visit on any shown site, 0 when the data covers the whole period. */
export function startIndex(rows: SiteRow[]): number {
  let first = Infinity
  for (const r of rows) {
    const i = r.series?.findIndex((v) => v > 0) ?? -1
    if (i >= 0) first = Math.min(first, i)
  }
  return Number.isFinite(first) ? first : 0
}

/** A series from the shared start on, so every sparkline covers the same days. */
export const fromStart = (values: number[] | null, start: number): number[] => (values ?? []).slice(start)

const TROUBLE = { down: 0, quiet: 1, ok: 2, new: 2 }

/** Down first, then quiet, then the most people online, then the most visitors. */
export function wallOrder(rows: SiteRow[], sites: Site[], now = Date.now()): SiteRow[] {
  const by = new Map(sites.map((s) => [s.id, s]))
  const trouble = (r: SiteRow) => {
    const s = by.get(r.id)
    return TROUBLE[s ? statusOf(s, now) : 'ok']
  }
  return [...rows].sort((a, b) => trouble(a) - trouble(b) || b.online - a.online || b.visitors - a.visitors)
}
