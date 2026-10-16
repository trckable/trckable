// "Go deeper" opens Explore over the Briefing with the thing filtered, or leads to the incident record.
import type { Site } from '../../lib/api'
import { navigate } from '../../lib/url'
import { openExplore } from '../explore/store'
import type { Tab } from '../explore/types'
import type { Deeper } from './model'

const TAB: Record<string, Tab> = { referrer: 'referrers', entry_page: 'pages', country: 'countries', goal: 'funnels' }

export function goDeeper(site: Site, d: Deeper) {
  if (d.kind === 'incidents') {
    navigate(`/${encodeURIComponent(site.domain)}/incidents`)
    return
  }
  const { dim } = d.filter
  openExplore({ tab: TAB[dim], filters: dim === 'goal' ? [] : [d.filter] })
}

/** Explore, with nothing narrowed. */
export function goExplore() {
  openExplore()
}
