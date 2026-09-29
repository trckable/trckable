// What someone types (or pastes) into the add-a-site field, as the domain the
// site is added under. Kept apart from the dialog so it is tested on its own.

/** A pasted address as a bare domain: no scheme, login, www, port, path, query or trailing dot. */
export function cleanDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/^\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/^[^@]*@/, '')
    .replace(/:\d*$/, '')
    .replace(/\.+$/, '')
    .replace(/^www\./, '')
}

const LABEL = /^[a-z0-9¡-￿]([a-z0-9¡-￿-]{0,61}[a-z0-9¡-￿])?$/

export type DomainCheck = 'empty' | 'space' | 'invalid' | 'ok'

/** Whether a cleaned domain can be added: labels of letters, digits and inner hyphens, at least two. */
export function checkDomain(clean: string, raw: string): DomainCheck {
  if (!raw.trim()) return 'empty'
  if (/\s/.test(raw.trim())) return 'space'
  if (clean.length > 253) return 'invalid'
  const labels = clean.split('.')
  if (labels.length < 2 && clean !== 'localhost') return 'invalid'
  return labels.every((l) => LABEL.test(l)) ? 'ok' : 'invalid'
}

/** Whether a site with this domain already exists (compared without www). */
export function isAdded(clean: string, domains: string[]): boolean {
  return clean !== '' && domains.some((d) => cleanDomain(d) === clean)
}
