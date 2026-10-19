// A link into the add-a-site wizard (?add=site&domain=…&taken=1), as from the
// website's site scan: the domain it names, read the way the wizard's own
// field reads what is typed.
import { checkDomain, cleanDomain } from '../features/install/domain'

/** A domain the wizard opens with, and whether it is already on another account. */
export type SitePrefill = { domain: string; taken: boolean }

/** The cleaned domain of a link when it is one that can be added, else null. */
export function prefillFrom(p: URLSearchParams): SitePrefill | null {
  const raw = p.get('domain') ?? ''
  const domain = cleanDomain(raw)
  return checkDomain(domain, raw) === 'ok' ? { domain, taken: p.get('taken') === '1' } : null
}
