// A site's modules for the pop-up: what is on, and the one way to switch one.
// Changing one tells the dashboard behind (it reads them again).
import { useEffect, useState } from 'react'
import { fail, more, api, type ModuleInfo, type Site } from '../../lib/apiMore'
import type { Mods } from '../../lib/modules'
import { modulesChanged } from '../../lib/useMods'

export function useFeatureMods(site: Site | null) {
  const [list, setList] = useState<ModuleInfo[] | null>(null)
  const [busy, setBusy] = useState('')
  useEffect(() => {
    if (!site) return
    let live = true
    api
      .modules(site.id)
      .then((d) => live && setList(d.modules))
      .catch(() => live && setList([]))
    return () => {
      live = false
    }
  }, [site])
  const mods: Mods = list ? Object.fromEntries(list.map((m) => [m.id, m.enabled])) : null
  /** Resolves true once the server has switched it. */
  const set = async (id: string, enabled: boolean): Promise<boolean> => {
    if (!site) return false
    setBusy(id)
    try {
      const d = await more.setModule(site.id, id, enabled)
      setList(d.modules)
      modulesChanged()
      return true
    } catch (e) {
      fail(e)
      return false
    } finally {
      setBusy('')
    }
  }
  return { mods, busy, set }
}
