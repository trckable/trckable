// The quiet rows under the cards, and the one thing the Briefing suggests doing next.
import type { Result, Site } from '../../lib/api'
import { fmtPct } from '../../lib/format'
import { openSettings } from '../../lib/settings'
import type { Setup } from '../ui/ConnectPlaceholder'
import type { Story } from './cards'
import { copy } from './copy'
import { goDeeper } from './deeper'
import type { Top } from './model'

/** One thing that is not set up yet, as a row: how it helps and the button that opens its setting. */
export function setupOf(key: 'rev' | 'search' | 'goals' | 'uptime' | 'alerts', site: Site, onGoal: () => void): Setup {
  const rows: Record<typeof key, Setup> = {
    rev: { key: 'rev', icon: 'sales', t: copy.revT, d: copy.revD, b: copy.connect, how: copy.revHow, act: () => openSettings(site, 'payments') },
    search: { key: 'search', icon: 'search', t: copy.searchT, d: copy.searchD, b: copy.connect, how: copy.searchHow, act: () => openSettings(site, 'search') },
    goals: { key: 'goals', icon: 'goals', t: copy.goalsT, d: copy.goalsD, b: copy.setUp, how: copy.goalsHow, act: onGoal },
    uptime: { key: 'uptime', icon: 'uptime', t: copy.uptimeT, d: copy.uptimeD, b: copy.turnOn, how: copy.uptimeHow, act: () => openSettings(site, 'health') },
    alerts: { key: 'alerts', icon: 'setup', t: copy.alertsT, d: copy.alertsD, b: copy.turnOn, how: copy.alertsHow, act: () => openSettings(site, 'alerts') },
  }
  return rows[key]
}

/** What is not set up yet: revenue, search, goals, uptime checks, alerts. */
export function setupRows(o: { site: Site; cur: Result; can: boolean; noSearch: boolean; noAlerts: boolean; onGoal: () => void }): Setup[] {
  if (!o.can) return []
  const want: ('rev' | 'search' | 'goals' | 'uptime' | 'alerts')[] = []
  if (!o.cur.money) want.push('rev')
  if (o.noSearch) want.push('search')
  if ((o.cur.goals ?? []).length === 0) want.push('goals')
  if (!o.site.watched_since) want.push('uptime')
  if (o.noAlerts) want.push('alerts')
  return want.map((k) => setupOf(k, o.site, o.onGoal))
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
