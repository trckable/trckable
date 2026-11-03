// Channel quality: each source with where its people land, how fast that page loads, and how many of them stay, reach the goal or pay.
// The main rate is the goal's, else sales', else the engaged visits': a site with neither goals nor payments still gets a true ranking.
// Nothing is claimed about a source with too few people to judge. Pure: quality.test.ts.
import { midTruncate } from '../../../features/signals/surge'
import { copy } from '../copy'

export type Main = 'goal' | 'sales' | 'engaged'

export interface QualityRow {
  value: string
  name: string
  /** The channel the source belongs to (Search, Social...); empty for Direct, which is its own. */
  channel: string
  people: number
  page: string | null
  /** The share who stay (did not leave at once), 0 to 1; null while the people are too few to say. */
  engaged: number | null
  /** The share reaching the goal; null with no goal or too few people. */
  goal: number | null
  /** The share who paid; null when no payments are connected or too few people. */
  sales: number | null
  /** That landing page's load time in ms; null when too little was measured. */
  lcp: number | null
}

export const ENOUGH = 20
export const SLOW_MS = 4000

export const rateOf = (reached: number | null, people: number): number | null => (reached === null || people < ENOUGH ? null : reached / people)

export function mainOf(hasGoal: boolean, hasSales: boolean): Main {
  if (hasGoal) return 'goal'
  return hasSales ? 'sales' : 'engaged'
}

/** The rate a row is ranked and drawn by. */
export const rateFor = (r: QualityRow, main: Main): number | null => r[main]

/** Judged sources first, best rate on top; the sources too small to judge follow by their people. */
export function ranked(rows: QualityRow[], main: Main): QualityRow[] {
  return [...rows].sort((a, b) => {
    const x = rateFor(a, main)
    const y = rateFor(b, main)
    if (x !== null && y !== null) return y - x || b.people - a.people
    if (x !== null || y !== null) return x !== null ? -1 : 1
    return b.people - a.people
  })
}

const secs = (ms: number) => (ms / 1000).toFixed(1)

export function headline(rows: QualityRow[], main: Main): string {
  const judged = rows.filter((r) => rateFor(r, main) !== null)
  if (judged.length < 2) return copy.qTooFew
  const best = ranked(judged, main)[0]
  if (!((rateFor(best, main) as number) > 0)) return copy.qTooFew
  if (main === 'engaged') return copy.qEngBest(best.name, Math.round((best.engaged as number) * 100))
  if (!best.page) return copy.qConvBest(best.name)
  const page = midTruncate(best.page, 28)
  if (best.lcp === null) return copy.qConvPage(best.name, page)
  return best.lcp > SLOW_MS ? copy.qConvSlow(best.name, page, secs(best.lcp)) : copy.qConvLoads(best.name, page, secs(best.lcp))
}
