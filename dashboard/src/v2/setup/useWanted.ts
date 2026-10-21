// What every setup prompt asks: is this one wanted? Read from the same checklist as the ring, so a step skipped or brought
// back there changes the prompts at once.
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { more } from '../../lib/apiMore'
import { lastState, onState, remember } from './memory'
import { wanted } from './model'

const asked = new Set<string>()

/**
 * `want(kind)`: the prompt of this kind (rev, search, goals, alerts, uptime) is shown only while it is wanted. A site whose
 * checklist this browser has not read is read now (`ask`: the person may see prompts at all); `known` tells whether it has
 * arrived, so a view can hold the prompt's space until then and nothing moves.
 */
export function useWanted(site: string | null, ask: boolean): ((kind: string) => boolean) & { known: boolean } {
  const state = useSyncExternalStore(onState, () => (site ? lastState(site) : null))
  useEffect(() => {
    if (!site || !ask || state || asked.has(site)) return
    asked.add(site)
    more.setup(site).then((s) => remember(site, s), () => asked.delete(site))
  }, [site, ask, state])
  const want = useCallback((kind: string) => wanted(state, kind), [state])
  return Object.assign(want, { known: !!state })
}
