// The average position Google shows a site at: each query weighted by how often it was shown, as Search Console does.
// The Briefing and Explore both say it from here, so the number is the same wherever it appears.
import type { SearchRow } from './api'

export function averagePosition(rows: SearchRow[] | null | undefined): number {
  const list = rows ?? []
  const shown = list.reduce((n, r) => n + r.impressions, 0)
  return shown ? list.reduce((n, r) => n + r.position * r.impressions, 0) / shown : 0
}
