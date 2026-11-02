// Channel quality: each source with where its people land, how many reach the goal, and how fast that page loads.
// Nothing is claimed about a source with too few people to judge. Pure: quality.test.ts.
import { copy } from '../copy'
export interface QualityRow {
  value: string
  name: string
  people: number
  page: string | null
  /** The share reaching the goal, 0 to 1; null while the people are too few to say or there is no goal. */
  rate: number | null
  /** That landing page's load time in ms; null when too little was measured. */
  lcp: number | null
}

export const ENOUGH = 20
export const SLOW_MS = 2500

export const rateOf = (reached: number | null, people: number): number | null => (reached === null || people < ENOUGH ? null : reached / people)

export function headline(rows: QualityRow[], goal: string | null): string {
  const judged = rows.filter((r) => r.rate !== null)
  const slow = rows.find((r) => r.people >= ENOUGH && r.lcp !== null && r.lcp > SLOW_MS)
  if (slow) return copy.qSlow(slow.name, slow.people, slow.page ?? '', (slow.lcp! / 1000).toFixed(1))
  if (goal && judged.length >= 2) {
    const best = judged.reduce((a, b) => ((b.rate as number) > (a.rate as number) ? b : a))
    if ((best.rate as number) > 0) return copy.qBest(best.name, Math.round((best.rate as number) * 100), goal)
  }
  return copy.qTooFew
}
