// A site's colour on the All sites page follows the site, never its rank: the
// n-th site of the account (the list's own order, oldest first) always has the
// n-th colour of the categorical palette (--ch-* in styles.css, validated for
// dark and light surfaces and for colour-blind readers). The palette is cycled
// by nobody: a site past the last colour is drawn neutral, and in the stacked
// chart the sites past it are one "Other" band.
import type { SiteRow } from '../lib/api'

/** How many colours the palette has. */
export const SITE_COLORS = 7

export const OTHER_COLOR = 'var(--text-3)'

/** Each site's colour, by its place in the account's list. */
export function siteColors(sites: { id: string }[]): Map<string, string> {
  return new Map(sites.map((s, i) => [s.id, i < SITE_COLORS ? `var(--ch-${i + 1})` : OTHER_COLOR]))
}

/** One drawn band of the stacked chart: a site, or all the sites past the palette as one. */
export interface Band {
  key: string
  /** The site's name; empty for the "Other" band. */
  label: string
  color: string
  series: number[]
  visitors: number
}

const add = (a: number[], b: number[] | null | undefined, n: number) => Array.from({ length: n }, (_, i) => (a[i] ?? 0) + (b?.[i] ?? 0))

/** The bands of the stack, bottom to top: the sites that have a colour, the biggest first, then "Other" on top. */
export function bandsOf(rows: SiteRow[], colors: Map<string, string>, n: number): Band[] {
  const seen = rows.filter((r) => r.series?.some((v) => v > 0))
  const named = seen.filter((r) => (colors.get(r.id) ?? OTHER_COLOR) !== OTHER_COLOR)
  const rest = seen.filter((r) => !named.includes(r))
  const out: Band[] = named
    .sort((a, b) => b.visitors - a.visitors)
    .map((r) => ({ key: r.id, label: r.name || r.domain, color: colors.get(r.id) ?? OTHER_COLOR, series: add([], r.series, n), visitors: r.visitors }))
  if (rest.length) out.push({ key: 'other', label: '', color: OTHER_COLOR, series: rest.reduce((a, r) => add(a, r.series, n), new Array<number>(n).fill(0)), visitors: rest.reduce((a, r) => a + r.visitors, 0) })
  return out
}
