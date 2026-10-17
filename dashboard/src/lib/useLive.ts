import { useEffect, useRef, useState } from 'react'
import type { Sale, Visit } from './api'
export { onlineNow } from './live'

/**
 * Server-sent events: online count and each new visit as it happens.
 * refetch is called (past the report cache) once new visits or sales
 * settle (settled is true then), when the tab is shown again after 5
 * minutes, and every minute while the stream is stuck; stale is true then.
 */
export function useLive(site: string | null, refetch: (settled?: boolean) => void, keep = 30) {
  const again = useRef(refetch)
  useEffect(() => {
    again.current = refetch
  })
  // The server's count and when it arrived: a polled count older than it must not replace it.
  const [count, setCount] = useState<{ n: number | null; at: number }>({ n: null, at: 0 })
  const [visits, setVisits] = useState<(Visit & { id: number })[]>([])
  const [sales, setSales] = useState<(Sale & { id: number })[]>([])
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!site) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new site gets a new stream; drop the old site's feed as it connects
    setVisits([])
    setSales([])
    let id = 0
    let stop: (() => void) | undefined
    let gone = false
    void import('./liveStream').then((m) => {
      if (gone) return
      stop = m.connect(site, {
        online: (n) => setCount({ n, at: Date.now() }),
        visit: (v) => {
          setVisits((vs) => [{ ...v, id: ++id }, ...vs].slice(0, keep))
        },
        sale: (sale) => {
          setSales((ss) => [{ ...sale, id: ++id }, ...ss].slice(0, keep))
        },
        up: setConnected,
        refetch: (settled) => again.current(settled),
      })
    })
    return () => {
      gone = true
      stop?.()
    }
  }, [site, keep])

  // Not delivering, for a site that has a stream: the report is polled.
  return { online: count.n, at: count.at, visits, sales, connected, stale: !!site && !connected }
}
