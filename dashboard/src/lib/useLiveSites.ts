// The sites list kept right while the dashboard is open: one read every few
// seconds while the tab is shown, so the last visit, the down flag and the
// check each surface draws its state from (the switcher's dot and line, the
// header, All sites, the Sites list, the Live view) follow the server without
// a refresh. Every surface reads the same list; none keeps a copy. The tick
// re-renders the page even when nothing changed, because a site goes quiet
// with the clock, not with a new fact.
import { useEffect, useState } from 'react'
import { api, type Site } from './api'
import { visibleInterval } from './visibleInterval'

export const SITES_POLL_MS = 15_000

/** Whether a read brought anything new: a site's state is all in these few fields. */
export function changed(a: Site[], b: Site[]): boolean {
  return JSON.stringify(a) !== JSON.stringify(b)
}

/** Reads the list again every few seconds while `on`; `apply` gets only a list that differs. Returns a counter that moves with each read, to re-render by. */
export const NO_SITES: Site[] = []

export function useLiveSites(on: boolean, current: Site[], apply: (sites: Site[]) => void): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!on) return
    let gone = false
    const read = () =>
      api
        .sites()
        .then((r) => {
          if (gone) return
          if (r.sites && changed(current, r.sites)) apply(r.sites)
          setTick((n) => n + 1)
        })
        .catch(() => {}) // the list on screen stays until the next read
    const stop = visibleInterval(() => void read(), SITES_POLL_MS)
    return () => {
      gone = true
      stop()
    }
  }, [on, current, apply])
  return tick
}
