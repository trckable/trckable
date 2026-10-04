// Which modules the open site has on, for the dashboard: read once, and read
// again whenever Settings → Modules (or a card that turns one on) changes
// them, so a module that was just switched on shows its entry points without a
// reload. A shared link carries its modules and never asks.
import { useEffect, useState } from 'react'
import { api } from './api'
import { isShared, sharedModules } from './me'
import type { Mods } from './modules'

const listeners = new Set<() => void>()

/** Tells the dashboard that a site's modules changed. */
export const modulesChanged = () => listeners.forEach((f) => f())

export function useMods(site: string): Mods {
  const [mods, setMods] = useState<Mods>(() => (isShared() ? sharedModules() : null))
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const again = () => setVersion((v) => v + 1)
    listeners.add(again)
    return () => {
      listeners.delete(again)
    }
  }, [])
  useEffect(() => {
    if (isShared()) return // the link carried them
    if (version === 0 && mods) return
    let live = true
    api
      .modules(site)
      .then((d) => live && setMods(Object.fromEntries(d.modules.map((m) => [m.id, m.enabled]))))
      .catch(() => live && setMods((m) => m ?? {})) // a module view that 404s simply hides itself
    return () => {
      live = false
    }
  }, [site, version]) // eslint-disable-line react-hooks/exhaustive-deps -- mods is only the "already have it" guard
  return mods
}
