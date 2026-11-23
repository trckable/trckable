// Opening Explore from anywhere: the address says whether it is open (?x=pages), which table it is on, and
// what it narrows by (?xf=), so a link opens it and Back leaves it.
import type { Filter } from '../../lib/api'
import { readView, setView, type ViewState } from '../../lib/url'
import { isTab, movedTo, type Tab } from './sections'

/** Open on a table, narrowed by some filters (the page's own when none are given). */
export function openExplore(tab: Tab = 'overview', filters?: Filter[]) {
  const cur = readView(new URLSearchParams(location.search))
  setView({ xp: tab, xf: filters ?? cur.xf ?? cur.filters })
}

/** An address that narrows the site (?f=country:US) opens Explore with those filters on, where the chips show them and every table is narrowed. */
export function routeFiltered(view: Pick<ViewState, 'xp' | 'filters'>): boolean {
  if (view.xp !== undefined || view.filters.length === 0) return false
  setView({ xp: 'overview', xf: view.filters, filters: [] }, { replace: true }) // an address's own filters: it is rewritten, not followed by a second entry that Back would route again
  return true
}

/** An address that names a table that was folded into another (?x=search) is rewritten to where it went; Google's old Search opens Sources with its panel. */
export function routeMoved(view: Pick<ViewState, 'xp'>): boolean {
  const to = movedTo(view.xp)
  if (!to) return false
  setView({ xp: to.tab, xs: to.source }, { replace: true })
  return true
}

/** What the address asks the panel to show: nothing while it is shut. */
export interface Ask {
  tab: Tab
  filters: Filter[]
  /** The source whose details stand beside Sources' table. */
  source?: string
}

export function askOf(view: Pick<ViewState, 'xp' | 'xf' | 'xs' | 'filters'>): Ask | null {
  if (!view.xp) return null
  const moved = movedTo(view.xp)
  const tab = moved?.tab ?? (isTab(view.xp) ? view.xp : 'overview')
  return { tab, filters: view.xf ?? view.filters, source: moved?.source ?? (tab === 'sources' ? view.xs : undefined) }
}
