// The latest visits of the site, read once a minute, for "meet one of them" (the live stream only carries what
// happens after the page opened).
import { useEffect, useState } from 'react'
import { call, type Visit } from '../../lib/api'
import { isShared } from '../../lib/me'

interface Event {
  ts: string
  kind: string
  visitor?: string
  path?: string
  referrer?: string
  country?: string
  city?: string
}

export function useRecent(site: string, on: boolean): Visit[] {
  const [list, setList] = useState<Visit[]>([])
  useEffect(() => {
    if (!on || isShared()) return
    let live = true
    const load = () =>
      void call<{ events: Event[] }>('GET', `/sites/${encodeURIComponent(site)}/events?limit=300`).then(
        (r) => live && setList((r.events ?? []).filter((e) => e.kind === 'pageview').map((e): Visit => ({ kind: 'pageview', ts: Date.parse(e.ts) / 1000, visitor: e.visitor, path: e.path, referrer: e.referrer, country: e.country, city: e.city }))),
        () => undefined,
      )
    load()
    const t = setInterval(load, 60_000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [site, on])
  return list
}
