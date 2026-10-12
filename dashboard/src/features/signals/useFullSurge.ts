// The dialog wants the whole story (the chart, the beats, the tiles). A surge
// from the card has it; one told by a notice (the bell) has only its numbers.
// For that one the site's current surge is asked for, and when it is the same
// busy moment its story and reasons are used. When it is not (the moment is
// over), the moment is read from what was stored, with a chart of its own
// window. Only when that cannot be read either, the numbers it was told with
// are all there is.
import { useEffect, useState } from 'react'
import { surgeApi, type Surge } from './surge'

/** A live surge is the same busy moment as a told one when they began this close together (seconds). */
const SAME = 15 * 60

export type StoryState = 'ready' | 'loading'

export function useFullSurge(given: Surge, site?: string): { surge: Surge; state: StoryState } {
  const need = !given.story && !!site
  const [got, setGot] = useState<{ id: string; full: Surge | null } | null>(null)
  useEffect(() => {
    if (!need || !site) return
    const ctl = new AbortController()
    const find = async (): Promise<Surge | null> => {
      const live = await surgeApi.now(site, ctl.signal)
      if (live?.story && Math.abs(live.started - given.started) <= SAME) return { ...live, id: given.id }
      const stored = await surgeApi.near(site, given.started, ctl.signal)
      return stored?.story ? { ...stored, id: given.id } : null
    }
    find()
      .then((full) => setGot({ id: given.id, full }))
      .catch(() => {
        if (!ctl.signal.aborted) setGot({ id: given.id, full: null })
      })
    return () => ctl.abort()
  }, [need, site, given.id, given.started])
  if (!need) return { surge: given, state: 'ready' }
  if (!got || got.id !== given.id) return { surge: given, state: 'loading' }
  return { surge: got.full ?? given, state: 'ready' }
}
