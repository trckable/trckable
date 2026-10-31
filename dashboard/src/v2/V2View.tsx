// Live and the Briefing: the walkthrough's header, and one of its two screens under it. This replaces the dashboard's
// own header and control rows for these two views; Explore (the full numbers) opens over either as a panel.
import { useEffect, useState, type ReactNode } from 'react'
import { tag } from '../i18n'
import { lazyLoad, whenIdle } from '../lib/lazyLoad'
import { setView, type ViewState } from '../lib/url'
import { PageHeader } from './PageHeader'
import '../mock/mock.css'
import '../mock/theme.css'
import '../kit/layout.css'
import type { Report, Site } from '../lib/api'
import { PRESETS, todayIn, type ISODate, type Range } from '../lib/dates'
import { dayWords, rangeWords } from './dayWords'
import { hasYear, vsWords } from './periodWords'
import { whyNot } from './briefing/compare'
import { switchTab } from '../features/live/switchView'
import { useViewKeys } from './useViewKeys'
import { usePeriodKeys } from './usePeriodKeys'
import { Briefing, BriefingSlot } from './briefing/BriefingSlot'
import { FreshSlot } from './briefing/FreshSlot'
import { copy } from './copy'
import { useV2Extras } from './slots'
import { PeriodChip } from './ui/PeriodChip'
import { periodPatch } from './ui/chartPick'
import { periodOptions } from './periodOptions'
import { TabBar } from './ui/TabBar'
import { goExplore } from './briefing/deeper'
import { routeFiltered } from './explore/open'
import { MkToastHost } from './ui/MkToastHost'
import { AiHost } from './ui/AiHost'
import { useActiveRow } from './ui/activeRow'
import { Live } from './live/Live'
import type { LiveProps } from './live/Live'
import { dateFmt } from '../lib/format'

// Explore's panel is its own chunk, fetched when the page is idle, so the first load does not carry it.
const ExplorePanel = lazyLoad(() => import('./explore/Panel').then((m) => ({ default: m.ExplorePanel })))

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
  /** The period's report could not be read and nothing older is shown: what says so, and asks again. */
  failed?: ReactNode
  money?: (minor: number) => string
  onGoal: () => void
  /** A goal was added from the header: the page's numbers are read again. */
  onGoalsChanged?: () => void
  /** Open Peek; absent where the person cannot ask. */
  onAsk?: () => void
  live: LiveProps
  /** A shared link's header (whose numbers these are): the page then has no Live and nothing that writes. */
  identity?: ReactNode
  /** A line over the screen: the busy moment the page was opened on. */
  top?: ReactNode
}

const grain = (a: ISODate, b: ISODate) => (a === b ? 'by hour' : 'by day')

export function V2View(p: V2Props) {
  const today = todayIn(p.site.timezone)
  const { options, more } = periodOptions(today)
  const weekday = dateFmt(tag ?? 'en-US', { weekday: 'long', timeZone: 'UTC' }).format(new Date(p.range.to + 'T12:00:00Z'))
  const day = p.view.period === 'today' || p.view.period === 'yesterday'
  const vs = vsWords(day, weekday, p.view, p.range)
  const label = day ? `${p.view.period === 'today' ? copy.today : copy.yesterday} · ${dayWords(p.range.to)}` : (PRESETS.find((q) => q.id === p.view.period)?.label ?? rangeWords(p.range, today, copy.todayWord))
  const here = p.tab
  const slots = useV2Extras()
  // Explore's panel is built the first time it is asked for, and stays so it can slide out again.
  const [opened, setOpened] = useState(false)
  if (p.view.xp !== undefined && !opened) setOpened(true)
  useActiveRow()
  useEffect(() => whenIdle(ExplorePanel.preload), [])
  // The other tab's code, fetched on idle: switching to it then has nothing to wait for.
  useEffect(() => whenIdle(Briefing.preload), [])
  useViewKeys(here, !p.waiting)
  usePeriodKeys({ on: here === 'briefing' && !p.waiting, today, range: p.range, view: p.view })
  // An old address with filters lands where the filters can be seen.
  useEffect(() => {
    if (!p.waiting) routeFiltered(p.view)
    // Once, on the address that was opened: shutting the panel clears the filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.waiting])
  const exploreOpen = () => (slots.askPeekNow ? window.dispatchEvent(new Event('trckable:find')) : goExplore())
  const setTab = (t: 'live' | 'briefing') => void switchTab(t, here)
  const periodChip = (idBase?: string) => (
    <PeriodChip
      idBase={idBase}
      label={label}
      vs={vs}
      options={options}
      more={more}
      value={p.view.period}
      compare={p.view.compare}
      compareNote={p.view.compare === 'none' ? undefined : (whyNot(p.data?.current?.series ?? [], p.data?.previous?.series) ?? undefined)}
      yearOk={hasYear(p.site)}
      today={today}
      customRange={p.range}
      grain={grain}
      onReset={p.view.period === 'today' ? undefined : () => setView({ period: 'today', from: undefined, to: undefined, bucket: undefined, day: undefined })}
      onPick={(id) => setView(periodPatch(id))}
      onCompare={(c) => setView({ compare: c })}
      bucket={p.view.bucket}
      onBucket={(b) => setView({ bucket: b })}
      onRange={(from, to) => setView({ period: 'custom', from, to, bucket: undefined, day: undefined })}
    />
  )
  // Both screens stay built once they have been shown, the one not on hidden: a switch moves no data and builds nothing, so
  // there is no loading shape, no card that arrives late and no number that starts over. Live is built when the page is idle
  // (its first answer is then already read); the Briefing keeps what it was showing while Live is on (Live has no period).
  const [liveOn, setLiveOn] = useState(here === 'live')
  const [briefFor, setBriefFor] = useState<string | null>(null)
  if (here === 'live' && !liveOn) setLiveOn(true)
  if (here === 'briefing' && briefFor !== p.site.id) setBriefFor(p.site.id)
  useEffect(() => (p.identity ? undefined : whenIdle(() => document.visibilityState === 'visible' && setLiveOn(true))), [p.identity])
  const now = { site: p.site, data: p.data, loading: p.loading, period: p.view.period, compare: p.view.compare, bucket: p.view.bucket, range: p.range, money: p.money, onGoal: p.onGoal, visits: p.live.stream.visits }
  // What the Briefing last had, for while it waits (the functions are taken with the rest, and renewed with it).
  const [kept, setKept] = useState(now)
  const moved = (['site', 'data', 'loading', 'period', 'compare', 'bucket', 'range', 'visits'] as const).some((k) => kept[k] !== now[k])
  if (here === 'briefing' && moved) setKept(now)
  const briefProps = here === 'briefing' ? now : kept
  const screen = (
    <>
      {briefFor === p.site.id && (
        <div className="view-pane" hidden={here !== 'briefing'}>
          <BriefingSlot {...briefProps} active={here === 'briefing'} />
        </div>
      )}
      {liveOn && (
        <div className="view-pane" hidden={here !== 'live'}>
          <Live {...p.live} />
        </div>
      )}
    </>
  )
  const shown = here === 'briefing' && p.failed ? p.failed : screen
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
        onGoalsChanged={p.onGoalsChanged}
        period={here === 'briefing' && !p.waiting ? periodChip() : null}
      />
      <main id="main" className="vfade">
        {p.top}
        {p.waiting ? <FreshSlot site={p.site} visits={p.live.stream.visits} /> : shown}
      </main>
      {opened && !p.waiting && <ExplorePanel site={p.site} range={p.range} view={p.view} label={label} period={periodChip('xper')} money={p.money} onGoal={p.onGoal} />}
      <AiHost site={p.site} />
      <MkToastHost />
      {!p.waiting && <TabBar value={p.view.xp ? 'explore' : here} labels={{ live: copy.live, briefing: copy.briefing, explore: slots.askPeekNow ? copy.askOrSearch : copy.exploreTab }} hide={p.identity ? ['live'] : undefined} onChange={(t) => (t === 'explore' ? exploreOpen() : setTab(t))} />}
    </div>
  )
}

