// The dialog wants the whole story (the hour's chart, the beats, the tiles). A surge
// from the card has it; one told by a notice (the bell) has only its numbers. For
// that one the site's current surge is asked for, and when it is the same busy
// moment its story and reasons are used. When the moment is over, the numbers it
// was told with are all there is.
import { useEffect, useState } from 'react'
import { surgeApi, type Surge } from './surge'

/** A live surge is the same busy moment as a told one when they began this close together (seconds). */
const SAME = 15 * 60

export type StoryState = 'ready' | 'loading' | 'over'

export function useFullSurge(given: Surge, site?: string): { surge: Surge; state: StoryState } {
  const need = !given.story && !!site
  const [got, setGot] = useState<{ id: string; live: Surge | null } | null>(null)
  useEffect(() => {
    if (!need || !site) return
    const ctl = new AbortController()
    surgeApi
      .now(site, ctl.signal)
      .then((live) => setGot({ id: given.id, live }))
      .catch(() => {
        if (!ctl.signal.aborted) setGot({ id: given.id, live: null })
      })
    return () => ctl.abort()
  }, [need, site, given.id])
  if (!need) return { surge: given, state: 'ready' }
  if (!got || got.id !== given.id) return { surge: given, state: 'loading' }
  const live = got.live
  if (live?.story && Math.abs(live.started - given.started) <= SAME) return { surge: { ...live, id: given.id }, state: 'ready' }
  return { surge: given, state: 'over' }
}
