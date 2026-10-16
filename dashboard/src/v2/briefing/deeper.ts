// "Go deeper" leaves the Briefing for the view that holds the full numbers: Data's Explore with the thing filtered, or the incident record.
import type { Site } from '../../lib/api'
import { navigate, setView } from '../../lib/url'
import type { Deeper } from './model'

export function goDeeper(site: Site, d: Deeper) {
  if (d.kind === 'incidents') {
    navigate(`/${encodeURIComponent(site.domain)}/incidents`)
    return
  }
  setView({ live: false, briefing: false, v: 'explore', filters: [d.filter] })
}

/** Data's Explore, with nothing narrowed. */
export function goExplore() {
  setView({ live: false, briefing: false, v: 'explore' })
}
