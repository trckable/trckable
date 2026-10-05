// Whether the AI crawlers module is off for a site, for the card that offers it.
// `undefined` while it is asked; false when it is on or the answer could not be
// read: a card never speaks on a guess.
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

export function useCrawlersOff(site: string, wanted: boolean): boolean | undefined {
  const [off, setOff] = useState<{ site: string; off: boolean } | null>(null)
  useEffect(() => {
    if (!wanted) return
    let live = true
    api
      .modules(site)
      .then((d) => live && setOff({ site, off: d.modules.some((m) => m.id === 'crawlers' && !m.enabled) }))
      .catch(() => live && setOff({ site, off: false }))
    return () => {
      live = false
    }
  }, [site, wanted])
  if (!wanted) return false
  return off?.site === site ? off.off : undefined
}
