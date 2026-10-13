// How All sites is looked at: the period, the lens (Visitors or Revenue), which
// sites, and the layout (Overview or Table). The choice lives in the address
// (?period, ?lens, ?sites, ?layout) so a link carries it, and the last choice
// of period, lens and layout is remembered in this browser for the next visit.
import { useState } from 'react'
import { LENSES, type Lens } from './allLens'

/** The lenses plus Uptime, which reads the incident record and is a page of its own, not a lens on the numbers. */
export type ViewLens = Lens | 'uptime'
const VIEW_LENSES: ViewLens[] = [...LENSES, 'uptime']

/** The periods the overview can be read for. */
export const PERIOD_DAYS = [7, 30, 90, 365]

export type Layout = 'overview' | 'table'
export const LAYOUTS: Layout[] = ['overview', 'table']

export interface View {
  days: number
  lens: ViewLens
  layout: Layout
  /** The ids of the sites shown; empty means every site. */
  sites: string[]
}

export const DEFAULT_VIEW: View = { days: 30, lens: 'visitors', layout: 'overview', sites: [] }
const KEY = 'trckable.all-sites.view'

const pick = <T extends string>(all: readonly T[], x: unknown, fallback: T): T => all.find((a) => a === x) ?? fallback

function remembered(): Partial<View> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>
    return { days: Number(v.days), lens: v.lens as ViewLens, layout: v.layout as Layout }
  } catch {
    return {}
  }
}

export function readView(): View {
  const q = new URLSearchParams(location.search)
  const old = remembered()
  const days = Number(q.get('period') ?? old.days)
  return {
    days: PERIOD_DAYS.includes(days) ? days : DEFAULT_VIEW.days,
    lens: pick(VIEW_LENSES, q.get('lens') ?? old.lens, DEFAULT_VIEW.lens),
    layout: pick(LAYOUTS, q.get('layout') ?? old.layout, DEFAULT_VIEW.layout),
    sites: (q.get('sites') ?? '').split(',').filter(Boolean),
  }
}

/** Puts the choice in the address (without a new history entry) and remembers it. */
export function saveView(v: View) {
  const u = new URL(location.href)
  u.searchParams.set('period', String(v.days))
  u.searchParams.set('lens', v.lens)
  u.searchParams.set('layout', v.layout)
  if (v.sites.length) u.searchParams.set('sites', v.sites.join(','))
  else u.searchParams.delete('sites')
  history.replaceState(null, '', u)
  try {
    localStorage.setItem(KEY, JSON.stringify({ days: v.days, lens: v.lens, layout: v.layout }))
  } catch {
    // Storage is blocked: the address still carries the choice.
  }
}

export const differs = (v: View): boolean => v.days !== DEFAULT_VIEW.days || v.lens !== DEFAULT_VIEW.lens || v.layout !== DEFAULT_VIEW.layout || v.sites.length > 0

export function useAllView(): [View, (change: Partial<View>) => void, () => void] {
  const [view, setView] = useState(readView)
  const change = (c: Partial<View>) => {
    const next = { ...view, ...c }
    saveView(next)
    setView(next)
  }
  return [view, change, () => change(DEFAULT_VIEW)]
}
