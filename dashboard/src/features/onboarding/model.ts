// The first run's small decisions, kept apart from the screens so they are
// tested on their own (model.test.ts).
import type { Visit } from '../../lib/api'

export type Step = 'site' | 'install' | 'here'

/** The three dots, one per step. */
export const STEPS: Step[] = ['site', 'install', 'here']

export function dotOf(step: Step): number {
  return STEPS.indexOf(step)
}

/** What people type, as the domain the site is added under. */
export function cleanDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
}

/** The numbers the preview shows once visits arrive. */
export function tally(visits: Visit[]): { visitors: number; pageviews: number } {
  const people = new Set(visits.map((v, i) => v.visitor ?? `anon-${i}`))
  return { visitors: people.size, pageviews: visits.filter((v) => v.kind === 'pageview').length }
}

/** Where to go when the first run ends: Live mode, which shows that visit. */
export function finishPath(domain: string, live: boolean): string {
  const base = '/' + encodeURIComponent(domain)
  return live ? base + '?view=live' : base
}

/** The first site, in the order they were added, that has had a visit; null while all wait. */
export function firstVisited(ids: string[], seen: Record<string, Visit[] | undefined>): string | null {
  return ids.find((id) => (seen[id]?.length ?? 0) > 0) ?? null
}
