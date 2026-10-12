// What to try, by fixed rules: one suggestion per kind of cause, in the order
// the causes are ranked, never more than two.
import type { BounceCause } from '../../lib/apiMore'

export const MAX_TRIES = 2

export type TryKey = BounceCause['kind']

export function triesOf(causes: BounceCause[]): TryKey[] {
  const kinds: TryKey[] = []
  for (const c of causes) if (!kinds.includes(c.kind)) kinds.push(c.kind)
  return kinds.slice(0, MAX_TRIES)
}

/** The page the button opens: the first page the causes name, else the first speed cause's page. */
export function topPage(causes: BounceCause[]): string | null {
  return causes.find((c) => c.kind === 'page' || c.kind === 'speed')?.label ?? null
}
