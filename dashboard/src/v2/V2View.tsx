// Live and the Briefing: the walkthrough's header, and one of its two screens under it. This replaces the dashboard's
// own header and control rows for these two views; Explore (the full numbers) opens over either as a panel.
import { useEffect, useMemo, useState } from 'react'
import '../mock/mock.css'
import '../mock/theme.css'
import type { Report, Site } from '../lib/api'
import { compareLabel, PRESETS, todayIn, type ISODate, type Range } from '../lib/dates'
import { dayWords, rangeWords } from './dayWords'
import { openAccount, openAddSite } from '../lib/account'
import { liveCount, siteDown } from '../features/live/liveLink'
import { switchTab } from '../features/live/switchView'
import { useProfile } from '../lib/profile'
import { isViewer } from '../lib/me'
import { navigate, setView, type ViewState } from '../lib/url'
import { openSettings } from '../lib/settings'
import { signOut } from '../lib/signOut'
import { chooseLang, chosen } from '../i18n/choose'
import { LANGUAGES } from '../i18n/languages'
import { THEMES, useTheme } from '../lib/theme'
import { openShortcuts } from '../components/ShortcutsHost'
import { useOverview } from '../views/useOverview'
import { useViewKeys } from './useViewKeys'
import { Bell } from './bell/Bell'
import { useNotices } from './bell/useNotices'
import { useV2Extras } from './slots'
import { BriefingSlot } from './briefing/BriefingSlot'
import { copy } from './copy'
import { AvatarMenu, type AvatarItem } from './ui/AvatarMenu'
import { ExploreChip, Header, Logo } from './ui/Header'
import { PeriodChip } from './ui/PeriodChip'
import { SegmentedSwitch } from './ui/SegmentedSwitch'
import { SiteChip, type SiteItem } from './ui/SiteMenu'
import { TabBar } from './ui/TabBar'
import { goExplore } from './briefing/deeper'
import { ExplorePanel } from './explore/Panel'
import { MkToastHost } from './ui/MkToastHost'
import { Palette } from './ui/Palette'
import { paletteItems } from './explore/palette'
import { copy as pal } from './explore/paletteCopy'
import { Live } from './live/Live'
import type { LiveProps } from './live/Live'

const FIRST = ['today', 'yesterday', '7d', '30d', '90d']
const MORE = ['12mo', 'wtd', 'mtd', 'lastmonth', 'ytd']

export interface V2Props {
  tab: 'live' | 'briefing'
  site: Site
  sites: Site[]
  view: ViewState
  range: Range
  data: Report | null
  loading: boolean
  money?: (minor: number) => string
  onGoal: () => void
  /** Open Peek; absent where the person cannot ask. */
  onAsk?: () => void
  live: LiveProps
}

function vsWords(day: boolean, weekday: string, view: ViewState, range: Range): string | undefined {
  if (day) return copy.vsUsual(weekday)
  return view.compare === 'none' ? undefined : `vs ${compareLabel(view.period, view.compare, range)}`
}

const grain = (a: ISODate, b: ISODate) => (a === b ? 'by hour' : 'by day')

export function V2View(p: V2Props) {
  const online = liveCount.use()
  const down = siteDown.use()
  const { profile } = useProfile()
  const slots = useV2Extras()
  const notices = useNotices(p.site, p.sites)
  const { rows } = useOverview(1)
  const today = todayIn(p.site.timezone)
  const viewer = isViewer()
  const items: SiteItem[] = p.sites.map((s) => ({ id: s.id, name: s.name || s.domain, note: s.domain === s.name ? undefined : s.domain, online: rows?.find((r) => r.id === s.id)?.online ?? 0, down: !!s.down_since }))
  const preset = (id: string) => {
    const x = PRESETS.find((q) => q.id === id)
    return x ? { id, name: id === 'today' ? copy.today : x.label, d: rangeWords(x.range(today), today, copy.todayWord) } : null
  }
  const options = FIRST.flatMap((id) => preset(id) ?? [])
  const more = MORE.flatMap((id) => preset(id) ?? [])
  const weekday = new Date(p.range.to + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
  const day = p.view.period === 'today' || p.view.period === 'yesterday'
  const vs = vsWords(day, weekday, p.view, p.range)
  const label = day ? `${p.view.period === 'today' ? copy.today : copy.yesterday} · ${dayWords(p.range.to)}` : (PRESETS.find((q) => q.id === p.view.period)?.label ?? rangeWords(p.range, today, copy.todayWord))
  const [theme, pickTheme] = useTheme()
  const account: AvatarItem[] = useMemo(
    () => [
      { key: 'notices', name: notices.unread ? `${copy.notifications} (${notices.unread})` : copy.notifications, run: () => document.getElementById('bellBtn')?.click() },
      ...(slots.accountRows ?? []),
      { key: 'sites', name: copy.sites, d: copy.sitesCount(p.sites.length), run: () => openAccount('sites'), line: true },
      { key: 'team', name: copy.team, run: () => openAccount('people') },
      { key: 'api', name: copy.api, run: () => openAccount('keys') },
      { key: 'profile', name: copy.profile, run: () => openAccount('profile') },
      { key: 'security', name: copy.security, d: copy.securityD, run: () => openAccount('profile') },
      {
        key: 'language',
        name: copy.language,
        panel: { title: copy.language, rows: [{ code: 'auto', name: copy.languageAuto }, ...LANGUAGES].map((l) => ({ key: l.code, name: l.name, on: chosen() === l.code, run: () => chooseLang(l.code) })) },
      },
      { key: 'theme', name: copy.theme, panel: { title: copy.theme, rows: THEMES.map((t) => ({ key: t, name: copy.themes[t], on: theme === t, run: () => pickTheme(t) })) } },
      { key: 'keys', name: copy.shortcuts, run: openShortcuts },
      { key: 'out', name: copy.signOut, line: true, run: signOut },
    ],
    [p.sites.length, slots.accountRows, theme, pickTheme, notices.unread],
  )
  const here = p.tab
  const [find, setFind] = useState(false)
  useViewKeys(here)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        e.stopImmediatePropagation()
        setFind((f) => !f)
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])
  const exploreOpen = () => goExplore()
  const siteMenu = {
    sites: items,
    current: p.site.id,
    onPick: (id: string) => (id === '*' ? navigate('/') : navigate('/' + encodeURIComponent(p.sites.find((s) => s.id === id)?.domain ?? ''))),
    footer: [
      { key: 'install', label: copy.track, run: () => openSettings(p.site, 'install') },
      { key: 'add', label: copy.addSite, run: openAddSite },
      { key: 'share', label: copy.share, run: () => openSettings(p.site, 'sharing') },
      { key: 'status', label: copy.statusPage, run: () => navigate(`/${encodeURIComponent(p.site.domain)}/incidents`) },
      { key: 'widgets', label: copy.widgets, run: () => openSettings(p.site, 'widgets') },
      { key: 'settings', label: copy.settings, run: () => openSettings(p.site, 'site') },
    ].filter((f) => !viewer || f.key === 'status'),
    workspace: slots.workspace,
    find: copy.find,
    all: copy.allSites,
  }
  const setTab = (t: 'live' | 'briefing') => void switchTab(t, here)
  return (
    <div className="mk mk-body" id="app">
      <Header
        logo={<Logo title={copy.allSites} onClick={() => navigate('/')} />}
        site={<SiteChip p={siteMenu} />}
        views={<SegmentedSwitch id="views" label={copy.view} value={here} onChange={setTab} items={[{ value: 'live', label: copy.live, title: copy.liveTitle, dot: down ? 'down' : 'ok', count: online ?? undefined }, { value: 'briefing', label: copy.briefing, title: copy.briefingTitle }]} />}
        period={
          here === 'briefing' ? (
            <PeriodChip
              label={label}
              vs={vs}
              options={options}
              more={more}
              value={p.view.period}
              compare={p.view.compare}
              yearOk={false}
              today={today}
              customRange={p.range}
              grain={grain}
              onPick={(id) => setView({ period: id, from: undefined, to: undefined, bucket: undefined, day: undefined })}
              onCompare={(c) => setView({ compare: c })}
              onRange={(from, to) => setView({ period: 'custom', from, to, bucket: undefined, day: undefined })}
            />
          ) : null
        }
        explore={<ExploreChip label={copy.explore} kbd="⌘K" onClick={exploreOpen} />}
        extras={slots.headerExtra}
        bell={<Bell site={p.site} notices={notices} />}
        account={<AvatarMenu initial={(profile?.name || profile?.email || '?').slice(0, 1).toUpperCase()} who={profile?.name || profile?.email.split('@')[0] || ''} d={viewer ? copy.viewer : copy.owner} items={account} back={copy.back} extras={slots.menuExtra} />}
      />
      <main id="main" className="vfade">
        {here === 'briefing' ? <BriefingSlot site={p.site} data={p.data} loading={p.loading} period={p.view.period} range={p.range} money={p.money} onGoal={p.onGoal} visits={p.live.stream.visits} /> : <Live {...p.live} />}
      </main>
      <ExplorePanel site={p.site} range={p.range} view={p.view} label={label} money={p.money} onGoal={p.onGoal} />
      {find && <Palette items={paletteItems({ sites: p.sites, site: p.site, data: p.data, here: p.tab, onAsk: p.onAsk, domainOf: (s) => s.domain })} placeholder={pal.placeholder} none={pal.none} onClose={() => setFind(false)} />}
      <MkToastHost />
      <TabBar value={p.view.xp ? 'explore' : here} labels={{ live: copy.live, briefing: copy.briefing, explore: copy.exploreTab }} onChange={(t) => (t === 'explore' ? exploreOpen() : setTab(t))} />
    </div>
  )
}

