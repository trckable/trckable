// What the search box offers: Peek first, then every table, the two views, the sites, the periods and the filters
// the page's own numbers suggest.
import type { Report, Site } from '../../lib/api'
import { countryName } from '../../lib/format'
import { navigate, setView } from '../../lib/url'
import { sourceName } from '../briefing/model'
import { switchTab } from '../../features/live/switchView'
import { openExplore } from './open'
import { ALL_TABS, sectionOf } from './sections'
import { copy } from './copy'
import { copy as pc } from './paletteCopy'
import type { PaletteItem } from '../ui/Palette'

const PERIODS: [string, string][] = [['today', 'Today'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['90d', 'Last 90 days']]

export function paletteItems(o: { sites: Site[]; site: Site | null; data: Report | null; here: 'live' | 'briefing'; onAsk?: () => void; onGoal?: () => void; domainOf: (s: Site) => string }): PaletteItem[] {
  const out: PaletteItem[] = []
  if (o.onAsk) out.push({ title: pc.ask, kind: pc.kinds.peek, group: pc.groups.ask, run: o.onAsk })
  // What the old Create menu made: a goal, a funnel (its steps are set in Explore), a note on the chart (the Briefing's sheet).
  if (o.site && o.onGoal) out.push({ title: pc.newGoal, kind: pc.kinds.create, group: pc.groups.create, run: o.onGoal })
  if (o.site) out.push({ title: pc.newFunnel, kind: pc.kinds.create, group: pc.groups.create, run: () => openExplore('funnels') })
  if (o.site && o.here === 'briefing') out.push({ title: pc.newNote, kind: pc.kinds.create, group: pc.groups.create, run: () => window.dispatchEvent(new Event('trckable:note')) })
  // The tables and the two views belong to a site; a page without one offers the sites and the periods only.
  if (o.site) for (const t of ALL_TABS) out.push({ title: `${copy.title} · ${t in copy.sub ? copy.sub[t] : copy.names[sectionOf(t)][0]}`, kind: pc.kinds.table, group: copy.title, run: () => openExplore(t) })
  if (o.site) out.push(
    { title: pc.goLive, kind: pc.kinds.view, group: pc.groups.goTo, run: () => void switchTab('live', o.here) },
    { title: pc.goBriefing, kind: pc.kinds.view, group: pc.groups.goTo, run: () => void switchTab('briefing', o.here) },
    { title: pc.clear, kind: pc.kinds.filter, group: pc.groups.goTo, run: () => setView({ filters: [], xf: undefined }) },
  )
  for (const s of o.sites) out.push({ title: pc.switchTo(s.name || s.domain), kind: pc.kinds.site, group: pc.groups.sites, run: () => navigate('/' + encodeURIComponent(s.domain)) })
  for (const [id, name] of PERIODS) out.push({ title: `${pc.period} · ${name}`, kind: pc.kinds.period, group: pc.groups.period, run: () => setView({ period: id, from: undefined, to: undefined }) })
  const dims = o.data?.current.dims
  for (const r of (dims?.referrer ?? []).slice(0, 8)) out.push({ title: `${pc.filter} · ${pc.source} ${sourceName(r.value) || r.value}`, kind: pc.kinds.filter, group: pc.groups.filters, run: () => openExplore('overview', [{ dim: 'referrer', value: r.value }]) })
  for (const r of (dims?.country ?? []).slice(0, 8)) out.push({ title: `${pc.filter} · ${pc.country} ${countryName(r.value)}`, kind: pc.kinds.filter, group: pc.groups.filters, run: () => openExplore('overview', [{ dim: 'country', value: r.value }]) })
  for (const r of (dims?.device ?? []).slice(0, 4)) out.push({ title: `${pc.filter} · ${r.value}`, kind: pc.kinds.filter, group: pc.groups.filters, run: () => openExplore('overview', [{ dim: 'device', value: r.value }]) })
  return out
}
