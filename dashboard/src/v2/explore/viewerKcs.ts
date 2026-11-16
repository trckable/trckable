// The Overview's tiles as a stranger on a shared link reads them: a tile with no figure, and a note that only says the
// site's own history is short, are for the site's people, so they are left out there.
import { isShared } from '../../lib/me'
import { copy } from './copy'
import type { Kc } from './types'

const NO_FIGURE = ['uptime', 'leave']

export function viewerKcs(kcs: Kc[]): Kc[] {
  if (!isShared()) return kcs
  return kcs.filter((k) => !(NO_FIGURE.includes(k.icon) && k.val === '–')).map((k) => (k.note.t === copy.tooLittleBefore ? { ...k, note: { ...k.note, t: '' } } : k))
}
