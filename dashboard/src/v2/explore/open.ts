// Opening Explore from anywhere: on a table, narrowed by some filters (the page's own when none are given).
import type { Filter } from '../../lib/api'
import { readView, setView } from '../../lib/url'
import type { Tab } from './sections'

export function openExplore(tab: Tab = 'overview', filters?: Filter[]) {
  const cur = readView(new URLSearchParams(location.search))
  setView({ xp: tab, xf: filters ?? cur.filters })
}
