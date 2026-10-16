// The quiet rows under the cards, and the one thing the Briefing suggests doing next.
import type { Result, Site } from '../../lib/api'
import { fmtPct } from '../../lib/format'
import { openSettings } from '../../lib/settings'
import type { Setup } from '../ui/ConnectPlaceholder'
import type { Story } from './cards'
import { copy } from './copy'
import { goDeeper } from './deeper'
import type { Top } from './model'

/** What is not set up yet: revenue, search, goals, uptime checks, alerts. Each row says how it helps and opens its setting. */
export function setupRows(o: { site: Site; cur: Result; can: boolean; noSearch: boolean; noAlerts: boolean; onGoal: () => void }): Setup[] {
  const { site, cur } = o
  if (!o.can) return []
  const rows: Setup[] = []
  if (!cur.money) rows.push({ key: 'rev', icon: 'sales', t: copy.revT, d: copy.revD, b: copy.connect, how: copy.revHow, act: () => openSettings(site, 'payments') })
  if (o.noSearch) rows.push({ key: 'search', icon: 'search', t: copy.searchT, d: copy.searchD, b: copy.connect, how: copy.searchHow, act: () => openSettings(site, 'search') })
  if ((cur.goals ?? []).length === 0) rows.push({ key: 'goals', icon: 'goals', t: copy.goalsT, d: copy.goalsD, b: copy.setUp, how: copy.goalsHow, act: o.onGoal })
  if (!site.watched_since) rows.push({ key: 'uptime', icon: 'uptime', t: copy.uptimeT, d: copy.uptimeD, b: copy.turnOn, how: copy.uptimeHow, act: () => openSettings(site, 'health') })
  if (o.noAlerts) rows.push({ key: 'alerts', icon: 'setup', t: copy.alertsT, d: copy.alertsD, b: copy.turnOn, how: copy.alertsHow, act: () => openSettings(site, 'alerts') })
  return rows
}

export interface Next {
  text: string
  rest?: string
  label: string
  run: () => void
}

/** The one next step: find out why the site stopped; answer the people a source sent; or look at the page people land on. */
export function nextStep(o: { site: Site; cur: Result; stories: Story[]; top: Top | null; downNow: boolean }): Next | null {
  const { site, cur, top } = o
  if (o.downNow) return { text: copy.actDown(site.domain), label: copy.actDownBtn, run: () => goDeeper(site, { kind: 'incidents' }) }
  const s = o.stories[0]
  if (top?.times && top.times > 2 && s?.key === 'sources') return { text: copy.actSource(top.name), rest: copy.actSourceRest(fmtPct(cur.kpis.bounce_rate)), label: copy.actSourceBtn, run: () => goDeeper(site, s.deeper) }
  const page = cur.dims.entry_page?.find((r) => r.value !== '/')
  if (!page) return null
  return { text: copy.actPage(page.value), rest: copy.actPageRest, label: copy.actPageBtn(page.value), run: () => goDeeper(site, { kind: 'explore', filter: { dim: 'entry_page', value: page.value } }) }
}
