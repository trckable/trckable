// The kind of site the homepage read suggests, for the add-a-site step. "other" is what the read says when it found
// nothing to go on, so it pre-fills nothing.
import type { InstallCheck, SiteKind } from '../../lib/apiMore'

export const KINDS: SiteKind[] = ['shop', 'saas', 'content', 'other']

export function guessOf(c: Pick<InstallCheck, 'kind'> | null): SiteKind | null {
  return c?.kind === 'shop' || c?.kind === 'saas' || c?.kind === 'content' ? c.kind : null
}
