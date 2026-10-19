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

/** Where the first-run steps open: a link naming a domain not yet among the
 *  sites still waiting for their first visit asks for that domain first (so
 *  a claimed site is not lost under them); otherwise the install step, on the
 *  named site when it is one of them. */
export function firstStep(resume: { id: string; domain: string }[] | undefined, prefill: SitePrefill | null): { step: 'site' | 'install'; active: string } {
  if (!resume?.length) return { step: 'site', active: '' }
  if (!prefill) return { step: 'install', active: resume[0].id }
  const named = resume.find((s) => s.domain === prefill.domain)
  return named ? { step: 'install', active: named.id } : { step: 'site', active: '' }
}
