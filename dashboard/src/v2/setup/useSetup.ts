// The checklist of the selected site: shown from the last read of this browser, and read when the site changes, when the panel opens, when settings close (a step
// may have been done there) and when the tab is looked at again; every change answers with the new checklist.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type SetupState, type Site } from '../../lib/apiMore'
import { useSettings } from '../../lib/settings'
import { lastState, readSetup, remember, SHARED_MS } from './memory'
import { isStale, visitMissed } from './model'

const FIRST = 2500

export function useSetup(site: Site | null, on: boolean, fresh = false, visited = false) {
  const [got, setGot] = useState<{ site: string; state: SetupState } | null>(null)
  // The checklist could not be had (a viewer's, an offline server): the header's slot then has nothing to wait for.
  const [failed, setFailed] = useState<string | null>(null)
  const id = site?.id ?? null
  const readAt = useRef(0)
  const settingsOpen = useSettings() !== null
  // What this browser last knew of the site: shown at once, and refreshed behind it.
  const known = useMemo(() => (id && on ? lastState(id) : null), [id, on])
  // Whether the first read of this page is still to come: a prompt may have made it already, and then it is the answer (readSetup).
  const first = useRef(true)
  const load = useCallback((reveal = false, maxAge = 0) => {
    if (!id || !on) return
    readSetup(id, maxAge)
      .then((state) => {
        remember(id, state)
        readAt.current = Date.now()
        // A site not known before waits until the tab is looked at again: a ring arriving late would push the header's other controls.
        if (known || reveal || fresh) setGot({ site: id, state })
      })
      .catch(() => setFailed(id))
  }, [id, on, known, fresh])
  // The first read waits a little: the ring is not what the page is waiting for.
  useEffect(() => {
    const age = first.current ? SHARED_MS : 0
    first.current = false
    const t = setTimeout(() => load(false, age), fresh ? 0 : FIRST)
    return () => clearTimeout(t)
  }, [load, settingsOpen, fresh])
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
          readAt.current = Date.now()
          setGot({ site: id, state })
        })
        .catch(() => undefined)
    },
    [id],
  )
  // Looked at again when something the checklist reads has changed (a first visit landed) or the panel opens on an old read.
  const refresh = useCallback(() => load(true), [load])
  const refreshIfOld = useCallback(() => {
    if (isStale(readAt.current, Date.now())) load(true)
  }, [load])
  const state = got && got.site === id ? got.state : known
  // The first visit has landed while the checklist still says the install waits: read again, once (the answer settles it either way).
  const missed = visitMissed(visited, state)
  useEffect(() => {
    if (missed) refresh()
  }, [missed, refresh])
  return { state, run, refreshIfOld, failed: failed === id }
}
