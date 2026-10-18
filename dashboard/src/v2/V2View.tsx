// Live and the Briefing: the walkthrough's header, and one of its two screens under it. This replaces the dashboard's
// own header and control rows for these two views; Explore (the full numbers) opens over either as a panel.
import { useEffect, useState, type ReactNode } from 'react'
import { tag } from '../i18n'
import { lazyLoad, whenIdle } from '../lib/lazyLoad'
import { setView, type ViewState } from '../lib/url'
import { PageHeader } from './PageHeader'
import '../mock/mock.css'
import '../mock/theme.css'
import type { Report, Site } from '../lib/api'
import { compareLabel, PRESETS, todayIn, type ISODate, type Range } from '../lib/dates'
import { dayWords, rangeWords } from './dayWords'
import { switchTab } from '../features/live/switchView'
import { useViewKeys } from './useViewKeys'
import { usePeriodKeys } from './usePeriodKeys'
import { Briefing, BriefingSlot } from './briefing/BriefingSlot'
import { FreshSlot } from './briefing/FreshSlot'
import { copy } from './copy'
import { PeriodChip } from './ui/PeriodChip'
import { TabBar } from './ui/TabBar'
import { goExplore } from './briefing/deeper'
import { routeFiltered } from './explore/open'
import { MkToastHost } from './ui/MkToastHost'
import { AiHost } from './ui/AiHost'
import { useActiveRow } from './ui/activeRow'
import { Live } from './live/Live'
import type { LiveProps } from './live/Live'

// Explore's panel is its own chunk, fetched when the page is idle, so the first load does not carry it.
const ExplorePanel = lazyLoad(() => import('./explore/Panel').then((m) => ({ default: m.ExplorePanel })))

const FIRST = ['today', 'yesterday', '7d', '30d', '90d']
const MORE = ['12mo', 'wtd', 'mtd', 'lastmonth', 'ytd']

interface V2Props {
  tab: 'live' | 'briefing'
  /** The site has no verified install yet: its page is one setup screen (the install, and the wait for the first visit), with no Live, Briefing or Explore. */
  waiting?: boolean
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
  /** A shared link's header (whose numbers these are): the page then has no Live and nothing that writes. */
  identity?: ReactNode
  /** A line over the screen: the busy moment the page was opened on. */
  top?: ReactNode
}

function vsWords(day: boolean, weekday: string, view: ViewState, range: Range): string | undefined {
  if (day) return copy.vsUsual(weekday)
  return view.compare === 'none' ? undefined : copy.vsLabel(compareLabel(view.period, view.compare, range))
}

const grain = (a: ISODate, b: ISODate) => (a === b ? 'by hour' : 'by day')

export function V2View(p: V2Props) {
  const today = todayIn(p.site.timezone)
  const preset = (id: string) => {
    const x = PRESETS.find((q) => q.id === id)
    return x ? { id, name: id === 'today' ? copy.today : x.label, d: rangeWords(x.range(today), today, copy.todayWord) } : null
  }
  const options = FIRST.flatMap((id) => preset(id) ?? [])
  const more = MORE.flatMap((id) => preset(id) ?? [])
  const weekday = new Date(p.range.to + 'T12:00:00Z').toLocaleDateString(tag ?? 'en-US', { weekday: 'long', timeZone: 'UTC' })
  const day = p.view.period === 'today' || p.view.period === 'yesterday'
  const vs = vsWords(day, weekday, p.view, p.range)
  const label = day ? `${p.view.period === 'today' ? copy.today : copy.yesterday} · ${dayWords(p.range.to)}` : (PRESETS.find((q) => q.id === p.view.period)?.label ?? rangeWords(p.range, today, copy.todayWord))
  const here = p.tab
  // Explore's panel is built the first time it is asked for, and stays so it can slide out again.
  const [opened, setOpened] = useState(false)
  if (p.view.xp !== undefined && !opened) setOpened(true)
  useActiveRow()
  useEffect(() => whenIdle(ExplorePanel.preload), [])
  // The other tab's code, fetched on idle: switching to it then has nothing to wait for.
  useEffect(() => whenIdle(Briefing.preload), [])
  useViewKeys(here, !p.waiting)
  usePeriodKeys({ on: here === 'briefing' && !p.waiting, today, range: p.range, view: p.view, day })
  // An old address with filters lands where the filters can be seen.
  useEffect(() => {
    if (!p.waiting) routeFiltered(p.view)
    // Once, on the address that was opened: shutting the panel clears the filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.waiting])
  const exploreOpen = () => goExplore()
  const setTab = (t: 'live' | 'briefing') => void switchTab(t, here)
  const periodChip = (idBase?: string) => (
    <PeriodChip
      idBase={idBase}
      label={label}
      vs={vs}
      options={options}
      more={more}
      value={p.view.period}
      compare={day ? 'none' : p.view.compare}
      yearOk={false}
      today={today}
      customRange={p.range}
      grain={grain}
      onReset={p.view.period === 'today' ? undefined : () => setView({ period: 'today', from: undefined, to: undefined, bucket: undefined, day: undefined })}
      onPick={(id) => setView({ period: id, from: undefined, to: undefined, bucket: undefined, day: undefined })}
      onCompare={(c) => setView({ compare: c })}
      bucket={p.view.bucket}
      onBucket={(b) => setView({ bucket: b })}
      onRange={(from, to) => setView({ period: 'custom', from, to, bucket: undefined, day: undefined })}
    />
  )
  const brief = <BriefingSlot site={p.site} data={p.data} loading={p.loading} period={p.view.period} range={p.range} money={p.money} onGoal={p.onGoal} visits={p.live.stream.visits} />
  const screen = here === 'briefing' ? brief : <Live {...p.live} />
  return (
    <div className="mk mk-body" id="app">
      <PageHeader
        sites={p.sites}
        site={p.site}
        tab={p.waiting ? undefined : here}
        waiting={p.waiting}
        visited={p.live.stream.visits.length > 0}
        data={p.data}
        onAsk={p.onAsk}
        identity={p.identity}
        onGoal={p.onGoal}
        period={here === 'briefing' && !p.waiting ? periodChip() : null}
      />
      <main id="main" className="vfade">
        {p.top}
        {p.waiting ? <FreshSlot site={p.site} visits={p.live.stream.visits} /> : screen}
      </main>
      {opened && !p.waiting && <ExplorePanel site={p.site} range={p.range} view={p.view} label={label} period={periodChip('xper')} money={p.money} onGoal={p.onGoal} />}
      <AiHost site={p.site} />
      <MkToastHost />
      {!p.waiting && <TabBar value={p.view.xp ? 'explore' : here} labels={{ live: copy.live, briefing: copy.briefing, explore: copy.exploreTab }} hide={p.identity ? ['live'] : undefined} onChange={(t) => (t === 'explore' ? exploreOpen() : setTab(t))} />}
    </div>
  )
}

