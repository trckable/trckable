// The busy moment Data was opened on (its start is in the address): read once from the stored
// moment, and shared by the line over the numbers and the band on the chart.
import { useEffect, useState } from 'react'
import { surgeApi, type Surge } from './surge'

const found = new Map<string, Promise<Surge | null>>()

export function useSurgeMoment(site: string, started: number | undefined): Surge | null {
  const [got, setGot] = useState<{ key: string; surge: Surge | null } | null>(null)
  const key = `${site}|${started ?? ''}`
  useEffect(() => {
    if (!started) return
    let on = true
    let ask = found.get(key)
    if (!ask) {
      ask = surgeApi.near(site, started).catch(() => null)
      found.set(key, ask)
    }
    void ask.then((surge) => on && setGot({ key, surge }))
    return () => {
      on = false
    }
  }, [key, site, started])
  return got?.key === key ? got.surge : null
}
