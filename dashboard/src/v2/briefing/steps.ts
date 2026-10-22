// The quiet rows under the cards, and the one thing the Briefing suggests doing next.
import type { Result, Site } from '../../lib/api'
import { fmtPct } from '../../lib/format'
import { openSettings } from '../../lib/settings'
import type { Setup } from '../ui/ConnectPlaceholder'
import type { Story } from './cards'
import { copy } from './copy'
import { goDeeper } from './deeper'
import type { Top } from './model'

/** One thing that is not set up yet, as a locked preview: the button that sets it up. */
function setupOf(key: 'rev' | 'search' | 'goals' | 'alerts', site: Site, onGoal: () => void): Setup {
  const rows: Record<typeof key, Setup> = {
    rev: { key: 'rev', b: copy.connect, act: () => openSettings(site, 'payments') },
    search: { key: 'search', b: copy.connect, act: () => openSettings(site, 'search') },
    goals: { key: 'goals', b: copy.setUp, act: onGoal },
    alerts: { key: 'alerts', b: copy.turnOn, act: () => openSettings(site, 'alerts') },
  }
  return rows[key]
}

/** What is not set up yet: revenue, search, goals, alerts (uptime is watched on its own). */
export function setupRows(o: { site: Site; cur: Result; can: boolean; shared: boolean; noSearch: boolean; noAlerts: boolean; want: (kind: string) => boolean; onGoal: () => void }): Setup[] {
  if (o.shared) return []
  const want: ('rev' | 'search' | 'goals' | 'alerts')[] = []
  if (!o.cur.money) want.push('rev')
  if (o.noSearch) want.push('search')
  if ((o.cur.goals ?? []).length === 0) want.push('goals')
  if (o.noAlerts) want.push('alerts')
  // Someone who may not set it up sees the same card and is asked to turn to an Owner or Admin.
  return want.filter(o.want).map((k) => (o.can ? setupOf(k, o.site, o.onGoal) : { ...setupOf(k, o.site, o.onGoal), act: undefined }))
}

/** One nudge at a time: the thing worth doing now (the site stopped, a source to answer) when there is one, else the first thing not set up yet. */
export function nudge(o: Parameters<typeof setupRows>[0] & { stories: Story[]; top: Top | null; downNow: boolean }): { setups: Setup[]; act: Next | null } {
  if (o.shared) return { setups: [], act: null }
  const act = nextStep(o)
  return act ? { setups: [], act } : { setups: setupRows(o).slice(0, 1), act: null }
}

export interface Next {
  text: string
  rest?: string
  label: string
  run: () => void
}

/** The one next step: find out why the site stopped, or answer the people a source sent. Nothing else is worth a bar of its own. */
export function nextStep(o: { site: Site; cur: Result; stories: Story[]; top: Top | null; downNow: boolean }): Next | null {
  const { site, cur, top } = o
  if (o.downNow) return { text: copy.actDown(site.domain), label: copy.actDownBtn, run: () => goDeeper(site, { kind: 'incidents' }) }
  const s = o.stories[0]
  if (top?.times && top.times > 2 && s?.key === 'sources') return { text: copy.actSource(top.name), rest: copy.actSourceRest(fmtPct(cur.dims.referrer?.find((r) => r.value === top.value)?.bounce_rate ?? cur.kpis.bounce_rate)), label: copy.actSourceBtn, run: () => goDeeper(site, s.deeper) }
  return null
}
