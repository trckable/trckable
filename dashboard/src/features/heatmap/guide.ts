// The card that suggests heatmaps: asked of the server (a page with a hundred
// views today, the module off), shown at most once a day with the other cards,
// and never again once it was put away or acted on. What is remembered is per
// site, in this browser; a browser that will not store it just asks again.
import { useEffect, useState } from 'react'
import { whenQuiet } from '../extras/quiet'
import { read, write } from '../moments/store'
import { heatApi, type HeatAsk } from './api'

const key = (site: string) => `trckable:heat:${site}`

/** Whether the card was put away or acted on for this site. */
export const heatDone = (site: string): boolean => read<boolean>(key(site), false)
export const markHeatDone = (site: string) => write(key(site), true)

/** What the server says about the site, once the page is quiet. null while it is on its way, and for a site that is past it. */
export function useHeatAsk(site: string, enabled: boolean): HeatAsk | null {
  const [got, setGot] = useState<{ site: string; ask: HeatAsk } | null>(null)
  const off = heatDone(site)
  useEffect(() => {
    if (!enabled || off) return
    const ac = new AbortController()
    const cancel = whenQuiet(() => {
      heatApi
        .ask(site, ac.signal)
        .then((ask) => setGot({ site, ask }))
        .catch(() => setGot({ site, ask: { ask: false } })) // never nag on a guess
    })
    return () => {
      cancel()
      ac.abort()
    }
  }, [site, enabled, off])
  if (off) return { ask: false }
  return got?.site === site ? got.ask : null
}
