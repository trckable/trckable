// The busy moments across the sites with someone online right now. Only those
// can be far busier than usual, so only they are asked (a few at most), once a
// minute while the tab is shown; the server finds the surge itself.
import { useEffect, useState } from 'react'
import { surgeApi, type Surge } from '../features/signals/surge'
import type { SiteRow } from '../lib/api'
import { visibleInterval } from '../lib/visibleInterval'

const MINUTE = 60_000
const MOST_ASKED = 6

export function useSurges(rows: SiteRow[] | null): Map<string, Surge> {
  const [found, setFound] = useState<Map<string, Surge>>(new Map())
  const asked = (rows ?? [])
    .filter((r) => !r.error && r.online > 0)
    .sort((a, b) => b.online - a.online)
    .slice(0, MOST_ASKED)
    .map((r) => r.id)
    .sort()
    .join(',')
  useEffect(() => {
    const ids = asked ? asked.split(',') : []
    const ac = new AbortController()
    const ask = () =>
      void Promise.all(ids.map((id) => surgeApi.now(id, ac.signal).then((s) => [id, s] as const).catch(() => [id, null] as const))).then((all) => {
        if (ac.signal.aborted) return
        setFound(new Map(all.flatMap(([id, s]) => (s ? [[id, s] as const] : []))))
      })
    if (ids.length === 0) return
    ask()
    const stop = visibleInterval(ask, MINUTE, false)
    return () => {
      ac.abort()
      stop()
    }
  }, [asked])
  // A site no longer asked about (nobody online) has no busy moment to show.
  return new Map([...found].filter(([id]) => asked.split(',').includes(id)))
}
