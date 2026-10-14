// What the Your links page works out from the answer: a row's bar, the filter a tap applies, the sample link.
import type { Filter } from '../../lib/api'
import type { Link } from './api'

/** A row's bar as a share of the busiest row, never a sliver too thin to see. */
export function barPct(visitors: number, max: number): number {
  if (max <= 0 || visitors <= 0) return 0
  return Math.max(3, Math.round((visitors / max) * 100))
}

/** The dashboard filter that shows only this link's visits. */
export const filterOf = (l: Pick<Link, 'dim' | 'value'>): Filter => ({ dim: l.dim, value: l.value })

/** The address the empty state offers to copy: this site with a tag to rename. */
export const sampleLink = (domain: string): string => `${domain}/?ref=newsletter`
