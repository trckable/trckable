// Opening and shutting Explore from anywhere: the address says whether it is open (?x=pages), which table it is on, and
// what it narrows by (?xf=), so a link opens it and Back leaves it.
import type { Filter } from '../../lib/api'
import { readView, setView, type ViewState } from '../../lib/url'
import { isTab, type Tab } from './sections'

/** Open on a table, narrowed by some filters (the page's own when none are given). */
export function openExplore(tab: Tab = 'overview', filters?: Filter[]) {
  const cur = readView(new URLSearchParams(location.search))
  setView({ xp: tab, xf: filters ?? cur.filters })
}

/** Shut. The Briefing and Live read the whole site, so what the panel narrowed by goes with it. */
export function closeExplore() {
  setView({ xp: undefined, xf: undefined, filters: [] })
}

/** An address that narrows the site (?f=country:US) opens Explore with those filters on, where the chips show them and every table is narrowed. */
export function routeFiltered(view: Pick<ViewState, 'xp' | 'filters'>): boolean {
  if (view.xp !== undefined || view.filters.length === 0) return false
  setView({ xp: 'overview', xf: view.filters, filters: [] })
  return true
}

/** What the address asks the panel to show: nothing while it is shut. */
export interface Ask {
  tab: Tab
  filters: Filter[]
}

export function askOf(view: Pick<ViewState, 'xp' | 'xf' | 'filters'>): Ask | null {
  if (!view.xp) return null
  return { tab: isTab(view.xp) ? view.xp : 'overview', filters: view.xf ?? view.filters }
}
