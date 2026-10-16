// "Go deeper" leaves the Briefing for the view that holds the full numbers: Data's Explore with the thing filtered, the
// incident record, or a page of its own.
import type { Site } from '../../lib/api'
import { mentionsPath } from '../../features/mentions/route'
import { navigate, setView } from '../../lib/url'
import type { Deeper } from './model'

export function goDeeper(site: Site, d: Deeper) {
  if (d.kind === 'incidents') navigate(`/${encodeURIComponent(site.domain)}/incidents`)
  else if (d.kind === 'mentions') navigate(mentionsPath(site.domain))
  else if (d.kind === 'explore') setView({ live: false, briefing: false, v: 'explore', filters: [d.filter] })
  else setView({ live: false, briefing: false, v: 'explore' })
}

/** Data's Explore, with nothing narrowed. */
export function goExplore() {
  setView({ live: false, briefing: false, v: 'explore' })
}
