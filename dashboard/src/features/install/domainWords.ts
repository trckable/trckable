// What the add-a-site field says about what was typed: what is wrong and what
// to do instead, with an example. One place, so the wizard and any other
// field that takes a domain use the same words.
import { wizard as t } from './copy'
import { type DomainCheck } from './domain'

/** The line under the field, or '' when there is nothing to say (empty, or fine). */
export function domainWords(verdict: DomainCheck | 'added', clean: string): string {
  if (verdict === 'space') return t.space
  if (verdict === 'invalid') return t.invalid
  if (verdict === 'added') return t.added(clean)
  return ''
}
