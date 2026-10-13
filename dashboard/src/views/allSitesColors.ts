// A site's colour on the All sites page follows the site, never its rank: the
// n-th site of the account (the list's own order, oldest first) always has the
// n-th colour of the categorical palette (--ch-* in styles.css, validated for
// dark and light surfaces and for colour-blind readers). A site past the last
// colour is drawn neutral.

/** How many colours the palette has. */
export const SITE_COLORS = 7

export const OTHER_COLOR = 'var(--text-3)'

/** Each site's colour, by its place in the account's list. */
export function siteColors(sites: { id: string }[]): Map<string, string> {
  return new Map(sites.map((s, i) => [s.id, i < SITE_COLORS ? `var(--ch-${i + 1})` : OTHER_COLOR]))
}
