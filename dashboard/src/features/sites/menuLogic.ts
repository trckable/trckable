// What the site menu decides about its list, apart from drawing it.
import type { Site } from '../../lib/api'
import { totalOf, type Today } from './useToday'

/** A list this long has a finder; a shorter one brings it up when a letter is typed. */
export const FINDER_FROM = 6

export const hasFinder = (count: number, query: string): boolean => count >= FINDER_FROM || query !== ''

const label = (s: Site) => (s.name || s.domain).toLowerCase()

/** The names two or more of the sites share: their rows say which domain is which (the others never do). */
export function clashing(sites: Site[]): Set<string> {
  const seen = new Set<string>()
  const twice = new Set<string>()
  for (const s of sites) {
    const n = label(s)
    if (seen.has(n)) twice.add(n)
    seen.add(n)
  }
  return twice
}

export const clashes = (twice: Set<string>, s: Site): boolean => twice.has(label(s))

/** The visitors of these sites only: the menu shows one team's, so the total is that team's. */
export function teamTotal(numbers: Map<string, Today> | null, sites: Site[]): number | null {
  if (!numbers) return null
  const ids = new Set(sites.map((s) => s.id))
  return totalOf(new Map([...numbers].filter(([id]) => ids.has(id)))).visitors
}
