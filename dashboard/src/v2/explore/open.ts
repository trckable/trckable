// Opening and shutting Explore from anywhere: the address says whether it is open (?x=pages), which table it is on, and
// what it narrows by (?xf=), so a link opens it and Back leaves it.
import type { Filter } from '../../lib/api'
import { historySteps, readView, setView, type ViewState } from '../../lib/url'
import { isTab, type Tab } from './sections'

/** Open on a table, narrowed by some filters (the page's own when none are given). */
export function openExplore(tab: Tab = 'overview', filters?: Filter[]) {
  const cur = readView(new URLSearchParams(location.search))
  if (cur.xp === undefined) opened = { step: historySteps() + 1, base: withoutPanel() }
  setView({ xp: tab, xf: filters ?? cur.filters })
}

/** Where the page stood when the app opened the panel: its step in the history, and its address without the panel's parts. */
let opened: { step: number; base: string } | null = null

/** The address with the panel's own parts taken out (its table and filters): what the page itself says. */
function withoutPanel(): string {
  const p = new URLSearchParams(location.search)
  p.delete('x')
  p.delete('xf')
  return location.pathname + '?' + p.toString()
}

/** Shut. The Briefing and Live read the whole site, so what the panel narrowed by goes with it. When the app opened it and nothing but the panel has changed since, shutting is Back to before it (so Back does not open it again); otherwise the address is replaced. */
export function closeExplore() {
  const was = opened
  opened = null
  const back = was ? historySteps() - was.step + 1 : 0
  if (was && back > 0 && withoutPanel() === was.base) {
    history.go(-back)
    return
  }
  setView({ xp: undefined, xf: undefined, filters: [] }, { replace: true })
}

/** An address that narrows the site (?f=country:US) opens Explore with those filters on, where the chips show them and every table is narrowed. */
export function routeFiltered(view: Pick<ViewState, 'xp' | 'filters'>): boolean {
  if (view.xp !== undefined || view.filters.length === 0) return false
  setView({ xp: 'overview', xf: view.filters, filters: [] }, { replace: true }) // an address's own filters: it is rewritten, not followed by a second entry that Back would route again
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
