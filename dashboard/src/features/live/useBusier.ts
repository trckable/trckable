import { useEffect, useState } from 'react'
import { liveBusier, type Busier } from './api'

// Asked about once a minute while Live is open (the server keeps an answer
// half a minute), and again when the tab is shown. A failed read keeps the
// last answer: this line is a hint, never an error.
const POLL_MS = 60_000

export function useBusier(site: string): Busier | null {
  const [answer, setAnswer] = useState<{ site: string; data: Busier } | null>(null)
  useEffect(() => {
    let ctl: AbortController | null = null
    const load = () => {
      ctl?.abort()
      const c = new AbortController()
      ctl = c
      liveBusier(site, c.signal)
        .then((data) => !c.signal.aborted && setAnswer({ site, data }))
        .catch(() => undefined)
    }
    load()
    const timer = window.setInterval(load, POLL_MS)
    const wake = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', wake)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', wake)
      ctl?.abort()
    }
  }, [site])
  return answer?.site === site ? answer.data : null
}
