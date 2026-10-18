// The checklist of the selected site: shown from the last read of this browser, and read when the site changes, when the panel opens, when settings close (a step
// may have been done there) and when the tab is looked at again; every change answers with the new checklist.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { more, type SetupState, type Site } from '../../lib/apiMore'
import { useSettings } from '../../lib/settings'
import { lastState, remember } from './memory'

const FIRST = 2500

export function useSetup(site: Site | null, on: boolean) {
  const [got, setGot] = useState<{ site: string; state: SetupState } | null>(null)
  const id = site?.id ?? null
  const settingsOpen = useSettings() !== null
  // What this browser last knew of the site: shown at once, and refreshed behind it.
  const known = useMemo(() => (id && on ? lastState(id) : null), [id, on])
  const load = useCallback((reveal = false) => {
    if (!id || !on) return
    more
      .setup(id)
      .then((state) => {
        remember(id, state)
        // A site not known before waits until the tab is looked at again: a ring arriving late would push the header's other controls.
        if (known || reveal) setGot({ site: id, state })
      })
      .catch(() => undefined)
  }, [id, on, known])
  // The first read waits a little: the ring is not what the page is waiting for.
  useEffect(() => {
    const t = setTimeout(() => load(), FIRST)
    return () => clearTimeout(t)
  }, [load, settingsOpen])
  useEffect(() => {
    const look = () => document.visibilityState === 'visible' && load(true)
    document.addEventListener('visibilitychange', look)
    return () => document.removeEventListener('visibilitychange', look)
  }, [load])
  const run = useCallback(
    (change: (site: string) => Promise<SetupState>) => {
      if (!id) return Promise.resolve()
      return change(id)
        .then((state) => {
          remember(id, state)
          setGot({ site: id, state })
        })
        .catch(() => undefined)
    },
    [id],
  )
  const state = got && got.site === id ? got.state : known
  return { state, run }
}
