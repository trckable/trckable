// What the Your links page and the Which link worked card work out from the answer: a row's bar, the filter a tap applies, the sample link, the best link.
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

/** A tagged link needs this many visitors in the period to be told on its own. */
export const MIN_VISITORS = 20

/** A name that points at the machine it was typed on: never a link, however it got in. */
export const isLocalName = (v: string): boolean => {
  const h = v.trim().toLowerCase().replace(/^\[|\]$/g, '')
  return h === 'localhost' || h === '::1' || h === '0.0.0.0' || /^127(\.\d{1,3}){3}$/.test(h) || /\.(local|localhost|test)$/.test(h)
}

/** The best tagged link and the next one, or none when nothing is worth saying: the one with the most goals (else visitors), and only with a goal reached or enough visitors. */
export function bestLinks<T extends Pick<Link, 'value' | 'visitors' | 'goals'>>(links: T[], goals: boolean): { best: T; runner?: T } | null {
  const rows = links.filter((l) => !isLocalName(l.value)).sort((a, b) => (goals ? b.goals - a.goals : 0) || b.visitors - a.visitors)
  const best = rows[0]
  if (!best || !((goals && best.goals > 0) || best.visitors >= MIN_VISITORS)) return null
  return { best, runner: rows[1] }
}

/** How much better than the site's usual a link converts, as a whole number of times, or none when it is not clearly better or the usual is unknown. */
export function timesUsual(link: Pick<Link, 'visitors' | 'goals'>, usual: number | undefined): number | undefined {
  if (!usual || link.visitors <= 0 || link.goals <= 0) return undefined
  const t = link.goals / link.visitors / usual
  return t >= 1.5 ? Math.round(t) : undefined
}
