// "Go deeper" opens the numbers behind a card: Explore, on the table that holds them, narrowed to the thing itself; or
// the incident record.
import type { Site } from '../../lib/api'
import { navigate } from '../../lib/url'
import { openExplore } from '../explore/open'
import type { Tab } from '../explore/sections'
import type { Deeper } from './model'

/** The table that holds a card's numbers, by the dimension it narrows. */
const TAB: Record<string, Tab> = { referrer: 'pages', page: 'pages', entry_page: 'pages', country: 'countries', device: 'devices', goal: 'funnels' }

export function goDeeper(site: Site, d: Deeper) {
  if (d.kind === 'incidents') navigate(`/${encodeURIComponent(site.domain)}/incidents`)
  else if (d.kind === 'mentions') openExplore('mentions')
  else if (d.kind === 'speed') openExplore('speed')
  else if (d.kind === 'table') openExplore(d.tab)
  else openExplore(TAB[d.filter.dim] ?? 'overview', [{ ...d.filter, dim: d.filter.dim === 'entry_page' ? 'page' : d.filter.dim }])
}

/** Explore, with nothing narrowed. */
export function goExplore() {
  openExplore('overview')
}
