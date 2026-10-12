// The short second line under a site's name in the switcher when its state
// needs words: "Not reachable · 2d", "Quiet · 5h". Null for every other state.
import type { Site } from '../../lib/api'
import { silence } from '../sitestatus/time'
import { copy } from './menuCopy'
import { dotState } from './StateDot'

export function stateLine(s: Site, now = Date.now()): string | null {
  const state = dotState(s, now)
  if (state === 'stopped') return copy.downLine(silence(s, now))
  if (state === 'quiet') return copy.quietLine(silence(s, now))
  return null
}
