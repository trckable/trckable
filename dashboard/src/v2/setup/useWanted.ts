// What every setup prompt asks: is this one wanted? Read from the same checklist as the ring, so a step skipped or brought
// back there changes the prompts at once.
import { useCallback, useSyncExternalStore } from 'react'
import { lastState, onState } from './memory'
import { wanted } from './model'

/** `want(kind)`: the prompt of this kind (rev, search, goals, alerts, uptime) is shown only while it is wanted. */
export function useWanted(site: string | null): (kind: string) => boolean {
  const state = useSyncExternalStore(onState, () => (site ? lastState(site) : null))
  return useCallback((kind: string) => wanted(state, kind), [state])
}
