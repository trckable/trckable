// The first run's small decisions, kept apart from the screens so they are
// tested on their own (model.test.ts).
import type { Visit } from '../../lib/api'
import { countryName } from '../../lib/format'

export type Step = 'site' | 'install' | 'here'

/** The three steps. */
export const STEPS: Step[] = ['site', 'install', 'here']

export function stepAt(step: Step): number {
  return STEPS.indexOf(step)
}

/** What the first visit tells about itself, only what is known: [kind, value], the source `null` for a direct visit. */
export type Fact = { kind: 'page' | 'source' | 'country'; value: string | null }

export function factsOf(v: Visit | undefined): Fact[] {
  if (!v) return []
  const host = (v.referrer ?? '').replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '')
  const place = [v.city, v.country ? countryName(v.country) : ''].filter(Boolean).join(', ')
  const facts: Fact[] = [{ kind: 'page', value: v.path ?? '/' }, { kind: 'source', value: host || null }]
  if (place) facts.push({ kind: 'country', value: place })
  return facts
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
