import { useEffect, useState } from 'react'
import type { Sale, Visit } from './api'

/** Server-sent events: online count and each new visit as it happens. */
export function useLive(site: string | null, keep = 30) {
  const [online, setOnline] = useState<number | null>(null)
  const [visits, setVisits] = useState<(Visit & { id: number })[]>([])
  const [sales, setSales] = useState<(Sale & { id: number })[]>([])
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!site) return
    setVisits([])
    setSales([])
    let id = 0
    // EventSource reconnects by itself (the server sends a heartbeat every 20 s).
    const es = new EventSource(`/api/v1/sites/${encodeURIComponent(site)}/live`)
    es.onopen = () => setConnected(true)
    es.onerror = () => setConnected(false)
    es.addEventListener('online', (e) => setOnline(JSON.parse((e as MessageEvent).data).online))
    es.addEventListener('visit', (e) => {
      const v = JSON.parse((e as MessageEvent).data) as Visit
      setVisits((vs) => [{ ...v, id: ++id }, ...vs].slice(0, keep))
    })
    // Only sent while the site's revenue module is on.
    es.addEventListener('sale', (e) => {
      const sale = JSON.parse((e as MessageEvent).data) as Sale
      setSales((ss) => [{ ...sale, id: ++id }, ...ss].slice(0, keep))
    })
    return () => es.close()
  }, [site, keep])

  return { online, visits, sales, connected }
}
