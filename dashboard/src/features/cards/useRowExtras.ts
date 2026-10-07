// A picture before each referring site: asked for once the list has drawn, so
// the report is never slowed by it; none for a shared link (it has no session
// to ask with). The rows' small charts are not drawn any more: the bars take
// their room.
import { useEffect, useState } from 'react'
import { SETTLE_MS } from '../../lib/settle'
import type { CardsCtx } from './ctx'
import type { Extras } from './rowExtras'

/** `{}` while they load (the room is kept), undefined for a list that has none of them. */
export function useRowExtras(c: CardsCtx, dim: string, keys: string[]): Extras | undefined {
  const icons = dim === 'referrer' && !c.shared
  const on = icons && !c.loading && keys.length > 0
  const id = `${c.site.id}|${dim}|${keys.join('\n')}|${JSON.stringify(c.query.filters)}`
  const [got, setGot] = useState<{ id: string; extras: Extras } | null>(null)
  useEffect(() => {
    if (!on) return
    let live = true
    // Decoration: after the page has had its moment, and not for a list that is changing under the pointer.
    const wait = setTimeout(() => {
      void import('./rowExtras')
        .then((m) => m.fetchRowExtras({ site: c.site.id, tz: c.site.timezone, dim, keys, filters: c.query.filters ?? [], spark: false, icons }))
        .then((extras) => live && setGot({ id, extras }))
        .catch(() => {})
    }, SETTLE_MS)
    return () => {
      live = false
      clearTimeout(wait)
    }
  }, [on, id]) // eslint-disable-line react-hooks/exhaustive-deps -- id says everything the request reads
  if (!on) return undefined
  return got?.id === id ? got.extras : { icons: icons ? new Set() : undefined }
}
