// The funnels the open site keeps by name, and the three things a person does with them here: save the funnel on
// screen, rename one, delete one. Opening one is only the address (its steps go into ?fs=).
import { useCallback, useEffect, useState } from 'react'
import { fail, more, type SavedFunnel } from '../../../lib/apiMore'

export function useSavedFunnels(site: string) {
  const [list, setList] = useState<SavedFunnel[]>([])
  useEffect(() => {
    let live = true
    more
      .funnels(site)
      .then((r) => live && setList(r.funnels))
      .catch(() => live && setList([]))
    return () => {
      live = false
    }
  }, [site])
  const run = useCallback((job: Promise<void>) => job.catch((e: unknown) => fail(e)), [])
  return {
    list,
    save: (name: string, steps: SavedFunnel['steps']) => run(more.saveFunnel(site, name, steps).then((f) => setList((l) => [...l, f]))),
    rename: (id: string, name: string) => run(more.updateFunnel(site, id, { name }).then((f) => setList((l) => l.map((x) => (x.id === id ? f : x))))),
    remove: (id: string) => run(more.deleteFunnel(site, id).then(() => setList((l) => l.filter((x) => x.id !== id)))),
  }
}

/** Whether a saved funnel counts exactly the steps on screen. */
export const sameSteps = (a: SavedFunnel['steps'], b: SavedFunnel['steps']) => a.length === b.length && a.every((s, i) => s.kind === b[i].kind && s.value === b[i].value)
