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

/** Shut. What the panel narrowed by is kept as the page's own filters. */
export function closeExplore() {
  const cur = readView(new URLSearchParams(location.search))
  setView({ xp: undefined, xf: undefined, filters: cur.xf ?? cur.filters })
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
