// Asks the server once a minute, while this tab is in sight, whether the site is
// far busier than usual. The server looks again at most every half minute, and
// finds the surge itself: this only reads it.
import { useEffect, useState } from 'react'
import { surgeApi, type Surge } from './surge'

const MINUTE = 60_000
/** The first look waits a little, so it is not one of the requests a page's first load makes. */
export const FIRST_LOOK_MS = 8000

export function useSurge(site: string, first = FIRST_LOOK_MS): Surge | null {
  const [got, setGot] = useState<{ site: string; surge: Surge | null } | null>(null)
  useEffect(() => {
    const ctl = new AbortController()
    const ask = () => {
      if (document.visibilityState !== 'visible') return
      void surgeApi
        .now(site, ctl.signal)
        .then((surge) => setGot({ site, surge }))
        .catch(() => {})
    }
    const soon = setTimeout(ask, first)
    const timer = setInterval(ask, MINUTE)
    document.addEventListener('visibilitychange', ask)
    return () => {
      ctl.abort()
      clearTimeout(soon)
      clearInterval(timer)
      document.removeEventListener('visibilitychange', ask)
    }
  }, [site, first])
  return got?.site === site ? got.surge : null
}
