// The rules of the All sites screen, apart from how it looks: where the
// sparklines start.
import type { SiteRow } from '../lib/api'

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
