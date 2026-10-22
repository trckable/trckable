// What the search box offers: Peek first, then every table, the two views, the sites, the periods and the filters
// the page's own numbers suggest.
import type { Report, Site } from '../../lib/api'
import { countryName } from '../../lib/format'
import { hasMentions, isShared } from '../../lib/me'
import { can } from '../../lib/permissions'
import { openAccount } from '../../lib/account'
import { openSettings, SETTINGS_TABS, type SettingsTab } from '../../lib/settings'
import { chooseLang, chosen } from '../../i18n/choose'
import { LANGUAGES } from '../../i18n/languages'
import { install, isInstalled } from '../../lib/installApp'
import { isIos, wayToInstall } from '../../lib/installWay'
import { offer } from '../../lib/pwa'
import { signOut } from '../../lib/signOut'
import { setTheme, THEMES } from '../../lib/theme'
import { toast } from '../../components/toastBus'
import { copy as ic } from '../../components/itemsCopy'
import { navigate, setView } from '../../lib/url'
import { sourceName } from '../briefing/model'
import { switchTab } from '../../features/live/switchView'
import { openFeatures } from '../../features/hub/openFeatures'
import { openShortcuts } from '../../components/ShortcutsHost'
import { canLeaveOut, choose, nextChoice, stateOf } from '../../features/exclude/ownVisits'
import { copy as exclude } from '../../features/exclude/copy'
import { openExplore } from './open'
import { ALL_TABS, offered, sectionOf } from './sections'
import { copy } from './copy'
import { copy as pc } from './paletteCopy'
import { copy as mc } from '../../features/milestones/copy'
import { copy as bc } from '../../features/bounce/b'
import { copy as kc } from '../../features/markers/copy'
import { markersOn, setMarkers } from '../../features/markers/settings'
import type { PaletteItem } from '../ui/Palette'

/** The settings sections as the settings dialog names them (it is English), and the words besides that find each. */
const TABS: Record<SettingsTab, string> = { site: 'General', install: 'Install', sharing: 'Sharing', widgets: 'Widgets', notes: 'Notes', payments: 'Payments', search: 'Search Console', mentions: 'Mentions', answers: 'Answers', privacy: 'Data & privacy', alerts: 'Alerts', health: 'Health' }
const TAB_WORDS: Partial<Record<SettingsTab, string>> = { sharing: 'share link public', alerts: 'notifications email report', privacy: 'cookies consent gdpr', site: 'site settings name timezone currency', payments: 'money stripe paddle' }

const PERIODS: [string, string][] = [['today', 'Today'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['90d', 'Last 90 days']]

export function paletteItems(o: { sites: Site[]; site: Site | null; data: Report | null; here: 'live' | 'briefing'; /** A site with no verified install: its page is the setup screen, so Live, the Briefing and Explore are not offered. */ fresh?: boolean; onAsk?: () => void; onGoal?: () => void; extra?: PaletteItem[]; domainOf: (s: Site) => string }): PaletteItem[] {
  const out: PaletteItem[] = []
  const ready = !o.fresh
  if (o.onAsk) out.push({ title: pc.ask, kind: pc.kinds.peek, group: pc.groups.ask, run: o.onAsk })
  // What the old Create menu made: a goal, a funnel (its steps are set in Explore), a note on the chart (the Briefing's sheet).
  if (o.site && o.onGoal && can('goal.create')) out.push({ title: pc.newGoal, kind: pc.kinds.create, group: pc.groups.create, run: o.onGoal })
  if (o.site && ready && can('funnel.create')) out.push({ title: pc.newFunnel, kind: pc.kinds.create, group: pc.groups.create, run: () => openExplore('funnels') })
  if (o.site && ready && o.here === 'briefing' && can('note.write')) out.push({ title: pc.newNote, kind: pc.kinds.create, group: pc.groups.create, run: () => window.dispatchEvent(new Event('trckable:note')) })
  // The tables and the two views belong to a site; a page without one offers the sites and the periods only.
  if (o.site && ready) for (const t of ALL_TABS.filter(offered)) out.push({ title: t in copy.sub ? copy.sub[t] : copy.names[sectionOf(t)][0], also: copy.title, kind: '', group: copy.title, run: () => openExplore(t) })
  // The chart's markers (the sources' pills) are shown or put away from here; the guide to leaving after one page opens from here too.
  if (o.site && ready && !isShared()) out.push({ title: kc.group, kind: pc.kinds.view, group: pc.groups.goTo, run: () => setMarkers(!markersOn()) })
  if (o.site && ready && !isShared()) out.push({ title: bc.label, kind: pc.kinds.view, group: pc.groups.goTo, run: () => window.dispatchEvent(new Event('trckable:bounce')) })
  if (o.site && ready && !isShared()) out.push({ title: mc.title, kind: pc.kinds.view, group: pc.groups.goTo, run: () => window.dispatchEvent(new Event('trckable:milestones')) })
  if (o.site && ready) out.push(
    ...(isShared() ? [] : [{ title: pc.goLive, kind: pc.kinds.view, group: pc.groups.goTo, run: () => void switchTab('live', o.here) }]),
    { title: pc.goBriefing, kind: pc.kinds.view, group: pc.groups.goTo, run: () => void switchTab('briefing', o.here) },
    { title: pc.refresh, kind: pc.kinds.action, group: pc.groups.goTo, run: () => window.dispatchEvent(new Event('trckable:refresh')) },
    { title: pc.clear, kind: pc.kinds.filter, group: pc.groups.goTo, run: () => setView({ filters: [], xf: undefined }) },
  )
  // Settings (every section, so "alerts" and "share" find theirs), the Mentions page, the theme and sign out: what the menus hold.
  // A viewer is offered neither the settings nor their sections, as the header and the site menu do not offer them.
  if (o.site && !isShared()) {
    const site = o.site
    if (can('site.settings')) out.push({ title: pc.siteSettings, also: 'settings preferences site', kind: pc.kinds.settings, group: pc.groups.settings, run: () => openSettings(site, 'site') })
    if (can('site.settings')) for (const t of SETTINGS_TABS.filter((t) => t !== 'mentions' || hasMentions())) out.push({ title: `${pc.settings} · ${TABS[t]}`, also: TAB_WORDS[t], kind: pc.kinds.settings, group: pc.groups.settings, run: () => openSettings(site, t) })
    if (hasMentions()) out.push({ title: pc.mentionsPage, kind: pc.kinds.view, group: pc.groups.goTo, run: () => navigate('/' + encodeURIComponent(site.domain) + '/mentions') })
  }
  if (!isShared()) {
    for (const t of THEMES) out.push({ title: pc.theme(ic.themes[t]), also: 'dark light auto appearance', kind: pc.kinds.theme, group: pc.groups.account, run: () => setTheme(t) })
    // What the avatar menu used to hold lives in the account window; each of it is found here.
    const account = { kind: pc.kinds.action, group: pc.groups.account }
    out.push({ ...account, title: pc.profile, also: 'account name picture password two-step sign-in devices', run: () => openAccount('profile') })
    for (const l of LANGUAGES) if (l.code !== chosen()) out.push({ ...account, title: pc.language(l.name), also: 'language idioma sprache langue', run: () => chooseLang(l.code) })
    if (chosen() !== 'auto') out.push({ ...account, title: pc.language(ic.languageAuto), also: 'language browser', run: () => chooseLang('auto') })
    out.push({ ...account, title: pc.features, also: 'features new what is new modules', run: openFeatures }, { ...account, title: pc.shortcuts, also: 'keys keyboard', run: openShortcuts })
    const way = wayToInstall({ offered: offer.get() !== null, ios: isIos(navigator.userAgent, navigator.maxTouchPoints), installed: isInstalled() })
    if (way) out.push({ ...account, title: ic.install, also: 'app pwa home screen', run: () => (way === 'ios' ? toast(ic.installHint, 'info') : void install()) })
    if (o.site && canLeaveOut(o.site)) {
      const site = o.site
      const next = nextChoice(stateOf(site))
      out.push({ ...account, title: next === 'ignore' ? exclude.leave : exclude.again, also: 'own visits ignore exclude count', run: () => choose(site, next) })
    }
    out.push(...(o.extra ?? []))
    out.push({ title: pc.signOut, also: 'log out', kind: pc.kinds.action, group: pc.groups.account, run: signOut })
  }
  for (const s of o.sites) out.push({ title: pc.switchTo(s.name || s.domain), kind: pc.kinds.site, group: pc.groups.sites, run: () => navigate('/' + encodeURIComponent(s.domain)) })
  if (ready) for (const [id, name] of PERIODS) out.push({ title: `${pc.period} · ${name}`, kind: pc.kinds.period, group: pc.groups.period, run: () => setView({ period: id, from: undefined, to: undefined }) })
  const dims = ready ? o.data?.current.dims : undefined
  for (const r of (dims?.referrer ?? []).slice(0, 8)) out.push({ title: `${pc.filter} · ${pc.source} ${sourceName(r.value) || r.value}`, kind: pc.kinds.filter, group: pc.groups.filters, run: () => openExplore('overview', [{ dim: 'referrer', value: r.value }]) })
  for (const r of (dims?.country ?? []).slice(0, 8)) out.push({ title: `${pc.filter} · ${pc.country} ${countryName(r.value)}`, kind: pc.kinds.filter, group: pc.groups.filters, run: () => openExplore('overview', [{ dim: 'country', value: r.value }]) })
  for (const r of (dims?.device ?? []).slice(0, 4)) out.push({ title: `${pc.filter} · ${r.value}`, kind: pc.kinds.filter, group: pc.groups.filters, run: () => openExplore('overview', [{ dim: 'device', value: r.value }]) })
  return out
}
