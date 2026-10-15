// The domain control's state, shared by the header (which says "· All" after the site's
// name) and the site switcher (which holds the row that picks). The dashboard publishes it
// while a site seen on more than one domain is open; nothing is published otherwise.
import { useSyncExternalStore } from 'react'
import type { Filter, Row } from './api'

export interface DomainControl {
  seen: Row[]
  filters: Filter[]
  site: string
  /** A domain, or null for all. */
  onPick: (host: string | null) => void
}

let current: DomainControl | null = null
const listeners = new Set<() => void>()

export function publishDomains(next: DomainControl | null) {
  current = next
  listeners.forEach((l) => l())
}

/** The control right now, for code that is not a component. */
export const domainsNow = () => current

export function useDomainControl(): DomainControl | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => void listeners.delete(l)
    },
    () => current,
    () => null,
  )
}
