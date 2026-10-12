// What to try, by fixed rules: the same short list for every guide, only the
// items the causes call for. Nothing here is a guess about the site.
import type { BounceCause } from '../../lib/apiMore'

export type FixKey = 'open' | 'see' | 'links' | 'speed'

/** The page the buttons open: the first page the causes name, else the first speed cause's page. */
export function topPage(causes: BounceCause[]): string | null {
  return causes.find((c) => c.kind === 'page' || c.kind === 'speed')?.label ?? null
}

/** True when a cause is about visitors on a phone. */
export const onPhone = (causes: BounceCause[]) => causes.some((c) => c.device === 'Mobile')

export function fixesOf(causes: BounceCause[]): FixKey[] {
  const out: FixKey[] = []
  if (causes.length > 0) out.push('open')
  if (topPage(causes)) out.push('see')
  if (causes.some((c) => c.kind === 'page')) out.push('links')
  if (causes.some((c) => c.kind === 'speed')) out.push('speed')
  return out
}

/** The address "Open the page like they do" goes to. */
export const pageURL = (domain: string, page: string | null) => 'https://' + domain + (page ?? '/')
