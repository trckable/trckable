// Asks the server once a minute, while this tab is in sight, whether the site is
// far busier than usual. The server looks again at most every half minute, and
// finds the surge itself: this only reads it.
import { useEffect, useState } from 'react'
import { surgeApi, type Surge } from './surge'

const MINUTE = 60_000

export function useSurge(site: string): Surge | null {
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
    ask()
    const timer = setInterval(ask, MINUTE)
    document.addEventListener('visibilitychange', ask)
    return () => {
      ctl.abort()
      clearInterval(timer)
      document.removeEventListener('visibilitychange', ask)
    }
  }, [site])
  return got?.site === site ? got.surge : null
}
