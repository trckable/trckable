// One row of the checklist: its words, whether it is done and the action that opens the exact place it gets done.
import { DOCS } from '../../components/footerLinks'
import type { SetupItem, SetupState, Site } from '../../lib/apiMore'
import { more } from '../../lib/apiMore'
import { openAccount } from '../../lib/account'
import { openSettings } from '../../lib/settings'
import { openExplore } from '../explore/open'
import { copy } from './copy'
import { providerName } from './model'

export interface RowAct {
  label: string
  run: () => void
  /** The quiet kind sits in the muted colour (Not for me, Change). */
  quiet?: boolean
}

export interface RowView {
  id: string
  title: string
  sub: string
  done: boolean
  acts: RowAct[]
}

export interface RowCtx {
  site: Site
  onGoal: () => void
  /** Owners and admins act; a viewer sees the rows only. */
  can: boolean
  /** Runs a change to the checklist. */
  change: (fn: (site: string) => Promise<SetupState>) => void
  close: () => void
}

const str = (d: SetupItem['detail'], k: string): string => {
  const v = d?.[k]
  return typeof v === 'string' ? v : ''
}
const num = (d: SetupItem['detail'], k: string): number => {
  const v = d?.[k]
  return typeof v === 'number' ? v : 0
}

/** Payments' line: the connected provider, the one seen on the page, or what the step is for. */
function payLine(it: SetupItem, provider: string): string {
  if (it.done) return copy.payments.connected(provider)
  return str(it.detail, 'provider') === '' ? copy.payments.sub : copy.payments.seen(provider)
}

/** The words and the main action of each step, by the server's id. */
function base(it: SetupItem, x: RowCtx, goalSuggestion: string): { title: string; sub: string; go?: RowAct } {
  const { site } = x
  const d = it.detail
  const at = (tab: Parameters<typeof openSettings>[1], extra?: Record<string, string>) => () => openSettings(site, tab, extra)
  const provider = providerName(str(d, 'provider'))
  const has = str(d, 'provider') !== ''
  switch (it.id) {
    case 'verified':
      return { title: copy.verified.title, sub: it.done ? copy.verified.done(num(d, 'pages')) : copy.verified.sub(num(d, 'pages')), go: { label: copy.verified.go, run: at('install') } }
    case 'own_visits':
      return { title: copy.own.title, sub: copy.own.sub, go: { label: copy.own.go, run: at('privacy', { focus: 'exclude-ips' }) } }
    case 'locale':
      return { title: copy.locale.title, sub: copy.locale.values(str(d, 'timezone'), str(d, 'currency')) }
    case 'goal':
      return { title: copy.goal.title, sub: goalSuggestion ? copy.goal.suggested(goalSuggestion) : copy.goal.sub, go: { label: copy.goal.go, run: x.onGoal } }
    case 'payments':
      return {
        title: copy.payments.title,
        sub: payLine(it, provider),
        go: { label: has ? copy.payments.goProvider(provider) : copy.payments.go, run: at('payments') },
      }
    case 'funnel':
      return { title: copy.funnel.title, sub: copy.funnel.sub, go: { label: copy.funnel.go, run: () => openExplore('funnels') } }
    case 'search':
      return { title: copy.search.title, sub: copy.search.sub, go: { label: copy.search.go, run: at('search') } }
    case 'crawlers':
      return { title: copy.crawlers.title, sub: copy.crawlers.sub, go: { label: copy.crawlers.go, run: () => openExplore('ai') } }
    case 'proxy':
      return { title: copy.proxy.title, sub: copy.proxy.sub, go: { label: copy.proxy.go, run: () => window.open(DOCS + 'install/proxy/', '_blank', 'noopener') } }
    case 'vitals':
      return { title: copy.vitals.title, sub: copy.vitals.sub(Math.round(num(d, 'bytes') / 1024)), go: { label: copy.open, run: at('site', { focus: 'script-records' }) } }
    case 'heatmaps':
      return { title: copy.heatmaps.title, sub: copy.heatmaps.sub, go: { label: copy.open, run: at('site', { focus: 'script-records' }) } }
    case 'ga':
      return { title: copy.ga.title, sub: copy.ga.sub, go: { label: copy.open, run: at('install') } }
    case 'team':
      return { title: copy.team.title, sub: copy.team.sub, go: { label: copy.open, run: () => openAccount('people') } }
    case 'phone':
      return { title: copy.phone.title, sub: copy.phone.sub, go: { label: copy.open, run: () => openAccount('profile') } }
    case 'mentions':
      return { title: copy.mentions.title, sub: copy.mentions.sub, go: { label: copy.open, run: at('mentions') } }
  }
  return { title: it.id, sub: '' }
}

export function rowView(it: SetupItem, x: RowCtx, goalSuggestion: string): RowView {
  const b = base(it, x, goalSuggestion)
  const acts: RowAct[] = []
  const closing = (run: () => void) => () => {
    x.close()
    run()
  }
  if (x.can) {
    if (it.skipped) {
      acts.push({ label: copy.bringBack, run: () => x.change((s) => more.setupSkip(s, it.id, false)) })
    } else if (!it.done) {
      if (it.id === 'locale') {
        acts.push({ label: copy.locale.right, run: () => x.change((s) => more.setupLocale(s)) })
        acts.push({ label: copy.locale.change, quiet: true, run: closing(() => openSettings(x.site, 'site')) })
      } else if (b.go) {
        acts.push({ label: b.go.label, run: closing(b.go.run) })
      }
      if (it.skippable) acts.push({ label: it.id === 'payments' ? copy.noSales : copy.notForMe, quiet: true, run: () => x.change((s) => more.setupSkip(s, it.id, true)) })
    }
  }
  return { id: it.id, title: b.title, sub: b.sub, done: it.done && !it.skipped, acts }
}
