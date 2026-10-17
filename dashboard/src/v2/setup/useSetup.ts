// The checklist of the selected site: read when the site changes, when the panel opens, when settings close (a step
// may have been done there) and when the tab is looked at again; every change answers with the new checklist.
import { useCallback, useEffect, useState } from 'react'
import { more, type SetupState, type Site } from '../../lib/apiMore'
import { useSettings } from '../../lib/settings'

const FIRST = 2500

export function useSetup(site: Site | null, on: boolean) {
  const [got, setGot] = useState<{ site: string; state: SetupState } | null>(null)
  const id = site?.id ?? null
  const settingsOpen = useSettings() !== null
  const load = useCallback(() => {
    if (!id || !on) return
    more
      .setup(id)
      .then((state) => setGot({ site: id, state }))
      .catch(() => undefined)
  }, [id, on])
  // The first read waits a little: the ring is not what the page is waiting for.
  useEffect(() => {
    const t = setTimeout(load, FIRST)
    return () => clearTimeout(t)
  }, [load, settingsOpen])
  useEffect(() => {
    const look = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', look)
    return () => document.removeEventListener('visibilitychange', look)
  }, [load])
  const run = useCallback(
    (change: (site: string) => Promise<SetupState>) => {
      if (!id) return Promise.resolve()
      return change(id)
        .then((state) => setGot({ site: id, state }))
        .catch(() => undefined)
    },
    [id],
  )
  const state = got && got.site === id ? got.state : null
  return { state, reload: load, run }
}
