// The sample dashboard behind the install card (lib/sample.ts), as its own
// chunk: only a site with no visit yet ever draws it. A site that has never
// seen a visit asks for it at once, so it is in before the install card is.
import { useEffect, useMemo, useState } from 'react'
import type { Report, Site } from './api'

type Make = typeof import('./sample').sampleReport

let make: Make | null = null
let loading: Promise<Make> | null = null
const load = () => (loading ??= import('./sample').then((m) => (make = m.sampleReport)))

export function useSample(site: Site, from: string, to: string, on: boolean): Report | null {
  const [ready, setReady] = useState(() => make)
  if (!site.last_event_at || on) void load()
  useEffect(() => {
    if (!on || ready) return
    let live = true
    void load().then((m) => live && setReady(() => m))
    return () => {
      live = false
    }
  }, [on, ready])
  return useMemo(() => (on && ready ? ready(site.id, site.timezone, from, to) : null), [on, ready, site.id, site.timezone, from, to])
}
