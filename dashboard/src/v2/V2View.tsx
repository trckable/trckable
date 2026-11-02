// Live and the Briefing: the walkthrough's header, and one of its two screens under it. This replaces the dashboard's
// own header and control rows for these two views; Explore (the full numbers) opens over either as a panel.
import { useEffect, useState, type ReactNode } from 'react'
import { setView, type ViewState } from '../lib/url'
import { PageHeader } from './PageHeader'
import '../mock/mock.css'
import '../mock/theme.css'
import '../kit/layout.css'
import type { Report, Site } from '../lib/api'
import { todayIn, type ISODate, type Range } from '../lib/dates'
import { dayWords, rangeWords } from './dayWords'
import { compares } from './explore/sections'
import { vsDates } from './explore/periods'
import type { Tab } from './explore/types'
import { hasYear } from './periodWords'
import { whyNot } from './briefing/compare'
import { switchTab } from '../features/live/switchView'
import { useViewKeys } from './useViewKeys'
import { usePeriodKeys } from './usePeriodKeys'
import { FreshSlot } from './briefing/FreshSlot'
import { copy } from './copy'
import { PeriodChip } from './ui/PeriodChip'
import { periodPatch } from './ui/chartPick'
import { periodOptions } from './periodOptions'
import { TabBar } from './ui/TabBar'
import { whenIdle } from '../lib/lazyLoad'
import { ExplorePage, preloadExplore } from './explore/Page'
import './why/why.css'
import { routeFiltered } from './explore/open'
import { MkToastHost } from './ui/MkToastHost'
import { AiHost } from './ui/AiHost'
import { useActiveRow } from './ui/activeRow'
import { Live } from './live/Live'
import type { LiveProps } from './live/Live'

// Explore's panel is its own chunk, fetched when the page is idle, so the first load does not carry it.

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
  const day = p.view.period === 'today' || p.view.period === 'yesterday'
  const label = day ? `${p.view.period === 'today' ? copy.today : copy.yesterday} · ${dayWords(p.range.to)}` : rangeWords(p.range, today, copy.todayWord)
  const here = p.tab
  // Explore's panel is built the first time it is asked for, and stays so it can slide out again.
  // Anything that opens a table of Explore from Live moves to the Explore screen.
  useEffect(() => {
    if (p.view.xp !== undefined && here === 'live') void switchTab('briefing', 'live', { replace: true })
  }, [p.view.xp, here])
  useActiveRow()
  useEffect(() => whenIdle(preloadExplore), [])
  // The other tab's code, fetched on idle: switching to it then has nothing to wait for.
  useViewKeys(here, !p.waiting)
  usePeriodKeys({ on: here === 'briefing' && !p.waiting, today, range: p.range, view: p.view })
  // An old address with filters lands where the filters can be seen.
  useEffect(() => {
    if (!p.waiting) routeFiltered(p.view)
    // Once, on the address that was opened: shutting the panel clears the filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.waiting])
  const setTab = (t: 'live' | 'briefing') => void switchTab(t, here)
  const periodChip = (idBase?: string) => (
    <PeriodChip
      idBase={idBase}
      label={label}
      vs={compares((p.view.xp ?? 'changed') as Tab) ? vsDates(p.view, p.range, today) : undefined}
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
  // What Explore last had, for while Live is on: Live's plain address is not Explore's to read. Another site starts afresh.
  const [held, setHeld] = useState({ view: p.view, range: p.range, site: p.site.id })
  if ((here === 'briefing' || held.site !== p.site.id) && (held.site !== p.site.id || JSON.stringify([held.view, held.range]) !== JSON.stringify([p.view, p.range]))) setHeld({ view: p.view, range: p.range, site: p.site.id })
  // Back from Live after a while: the numbers are read again.
  const [leftAt, setLeftAt] = useState(0)
  if (here === 'live' && !leftAt) setLeftAt(Date.now())
  if (here === 'briefing' && leftAt) setLeftAt(0)
  useEffect(() => {
    if (here === 'briefing' && leftAt && Date.now() - leftAt > 60_000) window.dispatchEvent(new Event('trckable:refresh'))
  }, [here, leftAt])
  const screen = (
    <>
      {briefFor === p.site.id && (
        <div className="view-pane" hidden={here !== 'briefing'}>
          <ExplorePage site={p.site} range={held.range} view={held.view} label={label} period={periodChip('xper')} money={p.money} onGoal={p.onGoal} />
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
        period={null}
      />
      <main id="main" className="vfade">
        {p.top}
        {p.waiting ? <FreshSlot site={p.site} visits={p.live.stream.visits} /> : shown}
      </main>
      <AiHost site={p.site} />
      <MkToastHost />
      {!p.waiting && <TabBar value={here} labels={{ live: copy.live, briefing: copy.exploreTab, explore: copy.exploreTab }} hide={p.identity ? ['live', 'explore'] : ['explore']} onChange={(t) => t !== 'explore' && setTab(t)} />}
    </div>
  )
}

