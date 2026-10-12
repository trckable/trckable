import { useEffect, useState } from 'react'
import { visibleInterval } from '../../lib/visibleInterval'
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
    const stop = visibleInterval(load, POLL_MS)
    return () => {
      stop()
      ctl?.abort()
    }
  }, [site])
  return answer?.site === site ? answer.data : null
}
