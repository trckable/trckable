// What the Your links page works out from the answer: a row's bar, the filter a tap applies, the sample link.
import type { Filter } from '../../lib/api'
import { tag } from '../../i18n'
import type { Link } from './api'

/** A row's bar as a share of the busiest row, never a sliver too thin to see. */
export function barPct(visitors: number, max: number): number {
  if (max <= 0 || visitors <= 0) return 0
  return Math.max(3, Math.round((visitors / max) * 100))
}

/** The dashboard filter that shows only this link's visits. */
export const filterOf = (l: Pick<Link, 'dim' | 'value'>): Filter => ({ dim: l.dim, value: l.value })

/** "2 hr. ago", "now": how long ago the latest visit was, in the reader's language. */
export function sinceLast(last: number, now: number): string {
  const s = Math.max(0, now - last)
  const [n, unit] = span(s)
  return new Intl.RelativeTimeFormat(tag, { numeric: 'auto', style: 'narrow' }).format(-n, unit)
}

function span(s: number): [number, Intl.RelativeTimeFormatUnit] {
  if (s < 45) return [0, 'second']
  if (s < 3600) return [Math.round(s / 60), 'minute']
  if (s < 86400) return [Math.round(s / 3600), 'hour']
  return [Math.round(s / 86400), 'day']
}

/** The address the empty state offers to copy: this site with a tag to rename. */
export const sampleLink = (domain: string): string => `${domain}/?ref=newsletter`

/** The most rows the dashboard card shows: the rest is on the page. */
export const CARD_ROWS = 3

/** The links the dashboard card shows: the busiest few. */
export const topLinks = <T extends { visitors: number }>(links: T[]): T[] => [...links].sort((a, b) => b.visitors - a.visitors).slice(0, CARD_ROWS)
