// Which modules the open site has on, for the dashboard: read once, and read
// again whenever a write changes them (What the script records, or a card that
// turns one on), so a choice that was just switched on shows its entry points
// without a reload. A shared link carries its modules and never asks.
import { useEffect, useState } from 'react'
import { api } from './api'
import { isShared, sharedModules } from './me'
import type { Mods } from './modules'
import { onSiteWrite } from './siteWrites'

export function useMods(site: string): Mods {
  const [mods, setMods] = useState<Mods>(() => (isShared() ? sharedModules() : null))
  const [version, setVersion] = useState(0)
  useEffect(() => {
    // Any write to the site's modules (every one goes through `call`) reads them again.
    return onSiteWrite((area, written) => area === 'modules' && written === site && setVersion((v) => v + 1))
  }, [site])
  useEffect(() => {
    if (isShared()) return // the link carried them
    if (version === 0 && mods) return
    let live = true
    api
      .modules(site, version > 0)
      .then((d) => live && setMods(Object.fromEntries(d.modules.map((m) => [m.id, m.enabled]))))
      .catch(() => live && setMods((m) => m ?? {})) // a module view that 404s simply hides itself
    return () => {
      live = false
    }
  }, [site, version]) // eslint-disable-line react-hooks/exhaustive-deps -- mods is only the "already have it" guard
  return mods
}
