// What the homepage check found, as one kind and one sentence. The server
// answers found = site · other · nosite · none, or an error when the page
// could not be read; each gets its own line, never a guess.
import type { InstallCheck } from '../../lib/api'
import { copy, type Outcome } from './copy'

const bare = (u: string) => u.replace(/^https?:\/\//, '').replace(/\/$/, '')

export function outcomeOf(c: InstallCheck, domain: string): { kind: Outcome; text: string; via?: string } {
  const where = bare(c.url || domain)
  if (c.error) return { kind: 'unreachable', text: copy.found.unreachable(c.error) }
  switch (c.found) {
    case 'site':
      return { kind: 'site', text: copy.found.site(where), via: c.via && c.via !== 'page' ? copy.found.viaScript(bare(c.via)) : undefined }
    case 'other':
      return { kind: 'other', text: copy.found.other(where) }
    case 'nosite':
      return { kind: 'nosite', text: copy.found.nosite(where) }
    default:
      return { kind: 'none', text: copy.found.none(where, c.scripts) }
  }
}
