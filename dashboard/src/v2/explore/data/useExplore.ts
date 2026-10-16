// What the panel reads: one section's answer for the site, period and filters, and what the menus need around it (what
// is connected, the values a filter can take, the saved views). From the API, or, in development with ?xfx=, from a
// sample world.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Filter, Site } from '../../../lib/api'
import type { Range } from '../../../lib/dates'
import type { ViewState } from '../../../lib/url'
import { keyOf } from '../filters'
import type { Connected, FilterDim, Option, SavedView, Tab, Tabs } from '../types'
import { fixtureName, fixtureTab, fixtureWorld } from './dev'
import { loadMeta, loadTab, removeView, saveView } from './real'
import { useLoad, type Loaded } from './useLoad'

export interface DataCtx {
  site: Site
  range: Range
  view: ViewState
  filters: Filter[]
  /** Writes an amount in the site's currency; absent where revenue is not shown. */
  money?: (minor: number) => string
}

export type TabData = Tabs[Tab]

export function useTab(tab: Tab, c: DataCtx, on: boolean): Loaded<TabData> {
  const fx = fixtureName()
  const key = [fx, c.site.id, c.range.from, c.range.to, c.view.compare, c.view.test, keyOf(c.filters), tab].join('|')
  return useLoad<TabData>(key, (signal) => (fx ? fixtureTab(fx, tab, c.filters) : loadTab(tab, c, signal)), on)
}

export interface Meta {
  connected: Connected
  options: Partial<Record<FilterDim, Option[]>>
  views: SavedView[]
  /** The period's words for the header ("Today · Fri 16 Oct"), when the sample says them. */
  label?: string
}

const NONE: Meta = { connected: { rev: true, search: true, goals: true }, options: {}, views: [] }

export function useMeta(c: DataCtx, on: boolean) {
  const fx = fixtureName()
  const [meta, setMeta] = useState<{ key: string; m: Meta } | null>(null)
  const [round, setRound] = useState(0)
  const key = [fx, c.site.id, c.range.from, c.range.to, round].join('|')
  useEffect(() => {
    if (!on) return
    let live = true
    const run = fx
      ? fixtureWorld(fx).then((w): Meta => ({ connected: w.connected, options: w.options, views: w.views, label: w.label }))
      : loadMeta(c)
    run.then(
      (m) => live && setMeta({ key, m }),
      () => live && setMeta({ key, m: NONE }),
    )
    return () => {
      live = false
    }
    // The key says what the read depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, on])
  const [local, setLocal] = useState<SavedView[] | null>(null)
  const m = meta?.key === key ? meta.m : null
  const views = useMemo(() => local ?? m?.views ?? [], [local, m])
  const save = useCallback(
    (v: SavedView) => {
      if (fx) setLocal([...views, v])
      else void saveView(c.site.id, c.view, v).then(() => setRound((n) => n + 1))
    },
    [fx, views, c.site.id, c.view],
  )
  const drop = useCallback(
    (i: number) => {
      if (fx) setLocal(views.filter((_, j) => j !== i))
      else void removeView(c.site.id, views[i]).then(() => setRound((n) => n + 1))
    },
    [fx, views, c.site.id],
  )
  return { meta: m ? { ...m, views } : { ...NONE, views, connected: { rev: false, search: false, goals: true } }, ready: !!m, save, drop }
}
