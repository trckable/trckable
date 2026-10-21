// The stack the server read from the site's homepage, as an install method.
// The tab opens on it until the person picks one; a stack the dialog has no
// method for (or none at all) changes nothing.
import { useEffect, useState } from 'react'
import { more } from '../../lib/apiMore'
import { METHODS } from '../../lib/install'

/** The method for what the server named, or null when it named nothing the dialog knows. */
export const stackMethod = (stack: string | undefined): string | null => METHODS.find((m) => m.id === stack)?.id ?? null

/** The tab to show: the person's own pick wins, then the site's stack, then the default. */
export const tabToShow = (picked: string, chosen: boolean, found: string | null): string => (chosen || !found ? picked : found)

/** Reads the site once when the install flow opens; null while waiting and when the read fails or is unsure. */
export function useStack(site: string): string | null {
  const [found, setFound] = useState<{ site: string; id: string | null } | null>(null)
  useEffect(() => {
    let current = true
    more
      .installStack(site)
      .then((r) => current && setFound({ site, id: stackMethod(r.stack) }))
      .catch(() => {})
    return () => {
      current = false
    }
  }, [site])
  return found?.site === site ? found.id : null
}
