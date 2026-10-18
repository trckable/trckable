// A site's page: the Briefing or Live under the one header, Explore over either. It reads the period's report, keeps the
// live stream, and holds the dialogs the two screens open (a visitor's journey, the goals). A shared link is the same page
// read only: the Briefing and Explore on what the public report carries, with no Live, no person and nothing that writes.
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { cachedReport, dropReports, showsInstall, api, type ReportQuery, type Site } from '../lib/api'
import { setWeekStart, todayIn, type Range } from '../lib/dates'
import { fmtMoney } from '../lib/format'
import { journeysOn } from '../features/cookieless/labels'
import { navigate, oldAddressTarget, readView, setDefaultPeriodFor, setView, useLocation, wantsLive, writeView } from '../lib/url'
import { queryOf, rangeOf } from '../lib/dashQuery'
import { canAsk, canChange, isShared } from '../lib/me'
import { useMods } from '../lib/useMods'
import { shows } from '../lib/modules'
import { onlineNow } from '../lib/useLive'
import { useNarrow } from '../lib/useNarrow'
import { useReport } from '../lib/useReport'
import { useKeymap } from '../lib/keys'
import { useLiveCount, useSiteDown } from '../features/live/liveLink'
import { filterOps } from '../features/header/filterOps'
import { DomainSwitch } from '../features/header/HeaderTools'
import { filterFrom } from '../features/journey/filterFrom'
import { GuideModal } from '../features/bounce/b'
import { rangeQS } from '../lib/api'
import { MilestonesSlot } from '../features/milestones/MilestonesSlot'
import { useMilestones } from '../features/milestones/useMilestones'
import { AskPanel } from './AskLazy'
import { useLiveRefresh } from './useLiveRefresh'
import { whenIdle } from '../lib/lazyLoad'
import { LoadFailed } from '../components/LoadFailed'

const V2View = lazy(() => import('../v2/V2View').then((m) => ({ default: m.V2View }))) // the two screens and their styles: one chunk, fetched when the page shows one
const GaReturn = lazy(() => import('../features/install/GaReturn').then((m) => ({ default: m.GaReturn }))) // only on the way back from Google (?import=ga)
const Signals = lazy(() => import('../features/signals/Signals')) // the tab's count, the sale toast and the notices: once the stream has spoken
const SurgeLine = lazy(() => import('../features/signals/SurgeBanner')) // the line over the page when it was opened on a busy moment
const Notices = lazy(() => import('./Notices')) // the note over test payments
const AddGoals = lazy(() => import('./AddGoals').then((m) => ({ default: m.AddGoals })))
const JourneyDialog = lazy(() => import('../features/journey/JourneyDialog').then((m) => ({ default: m.JourneyDialog })))

export function SiteHost({ site, sites, identity }: { site: Site; sites: Site[]; identity?: React.ReactNode }) {
  // Before anything reads a date: "This week" starts on the site's own day.
  setWeekStart(site.week_start)
  setDefaultPeriodFor(site)
  useKeymap()
  const shared = isShared()
  const { params } = useLocation()
  const view = readView(params)
  const today = todayIn(site.timezone)
  const range: Range = useMemo(() => rangeOf(view, today), [view.period, view.from, view.to, today]) // eslint-disable-line react-hooks/exhaustive-deps -- view is new each render: keyed by the fields the range reads
  const filtersKey = JSON.stringify(view.filters)
  const query: ReportQuery = useMemo(
    () => queryOf(view, range),
    [range.from, range.to, view.compare, view.cfrom, view.cto, view.period, filtersKey, view.test, view.bucket, view.attr], // eslint-disable-line react-hooks/exhaustive-deps -- view and range are new objects each render: keyed by content (filtersKey)
  )
  const live = range.to === today
  const { data, error, loading, refresh } = useReport(site.id, query, { poll: shared && live })
  // A shared link has no session, so no stream (its report is read again once a minute); a new visit on the stream reloads the report past its cache.
  const refreshHours = useRef<(skipCache: boolean) => void>(undefined)
  const stream = useLiveRefresh(shared ? '' : site.id, live, refresh, refreshHours)

  // On Live, the Briefing's report is read when the page is idle, so the first switch to it has its numbers.
  const onLive = !shared && wantsLive(view, site)
  useEffect(() => {
    if (!onLive) return
    const v = { ...view, period: view.period === '30d' && !view.from ? 'today' : view.period }
    return whenIdle(() => void cachedReport(site.id, queryOf(v, rangeOf(v, today))).catch(() => undefined))
  }, [onLive, site.id, today]) // eslint-disable-line react-hooks/exhaustive-deps -- once per site and day: the view is read as it is when idle

  // A site with nothing in it yet shows the install screen until its first visit; a shared link is only made for a site that works.
  const firstLoad = !data && !error && !!site.last_event_at
  const cur = data?.current
  const hasData = !!cur && (cur.kpis.sessions > 0 || (data?.previous?.kpis.sessions ?? 0) > 0)
  const mayBeNew = !firstLoad && !hasData && view.filters.length === 0
  const [everTracked, setEverTracked] = useState<boolean | null>(() => (shared ? true : null))
  useEffect(() => {
    if (!mayBeNew || everTracked !== null) return
    api
      .events(site.id, 1)
      .then((r) => setEverTracked(r.events.length > 0))
      .catch(() => setEverTracked(true)) // on error, assume installed: never fake a working page
  }, [mayBeNew, everTracked, site.id])
  const waiting = showsInstall({ site, hasData, filtered: view.filters.length > 0, everTracked }) && stream.visits.length === 0
  const liveView = !shared && !waiting && wantsLive(view, site)

  // The addresses the old Data page had (?view=data, ?v=explore, Full) land here: the Briefing, and Explore for the ones that were its numbers.
  useEffect(() => {
    const to = oldAddressTarget(view)
    if (to) navigate(location.pathname + writeView(to), { replace: true })
  }, [view.v, view.mode]) // eslint-disable-line react-hooks/exhaustive-deps -- the address is read whole when it needs the change

  const mods = useMods(site.id)
  // Milestones: the celebration when one is reached, and the timeline (opened from ⌘K) with its share sheet.
  const ms = useMilestones(site)
  useEffect(() => {
    if (shared) return
    window.addEventListener('trckable:milestones', ms.openList)
    return () => window.removeEventListener('trckable:milestones', ms.openList)
  }, [shared, ms.openList])
  const [journey, setJourney] = useState<string | null>(null)
  const [addGoals, setAddGoals] = useState(false)
  const [askOpen, setAskOpen] = useState(false)
  const [bounce, setBounce] = useState(false)
  useEffect(() => {
    if (shared) return
    const open = () => setBounce(true)
    window.addEventListener('trckable:bounce', open)
    return () => window.removeEventListener('trckable:bounce', open)
  }, [shared])
  const askOn = canAsk()
  const narrow = useNarrow()
  const money = mods === null || shows(mods, 'cards', 'revenue') ? cur?.money : undefined
  const fmtM = (minor: number) => (money ? fmtMoney(minor, money.currency, money.exponent) : '')
  // The tab's count and the red dot while the site does not answer.
  useLiveCount(onlineNow(stream, data?.online, data?.online))
  useSiteDown(!!site.down_since)
  return (
    <>
      <Suspense fallback={null}>
        <V2View
          tab={liveView ? 'live' : 'briefing'}
          waiting={waiting}
          site={site}
          sites={sites}
          view={view}
          range={range}
          data={data}
          loading={loading || firstLoad}
          failed={!data && error ? <LoadFailed reason={error} onRetry={() => refresh(true)} /> : undefined}
          money={money ? fmtM : undefined}
          onGoal={() => canChange() && setAddGoals(true)}
          onAsk={askOn ? () => setAskOpen(true) : undefined}
          identity={identity}
          top={view.surge ? <Suspense fallback={null}><SurgeLine site={site.id} tz={site.timezone} started={view.surge} filters={view.filters} /></Suspense> : undefined}
          live={{ site: site.id, timezone: site.timezone, stream, cookieless: site.cookieless, whole: site, onVisitor: !shared && journeysOn(site, mods !== null && shows(mods, 'cards', 'journey')) ? setJourney : undefined }}
        />
      </Suspense>
      {!liveView && !waiting && <DomainSwitch seen={cur?.hosts ? cur.dims.hostname : null} filters={view.filters} site={site.domain} narrow={narrow} onPick={filterOps.domain} />}
      {journey && mods !== null && shows(mods, 'cards', 'journey') && (
        <Suspense fallback={null}>
          <JourneyDialog site={site} visitor={journey} query={query} onClose={() => setJourney(null)} onFilter={(dim, value) => filterFrom(view, dim, value)} />
        </Suspense>
      )}
      {addGoals && shows(mods, 'cards', 'goals') && (
        <Suspense fallback={null}>
          <AddGoals
            site={site}
            pages={(cur?.dims.page ?? []).map((r) => r.value)}
            onClose={() => setAddGoals(false)}
            onChanged={() => {
              dropReports(site.id)
              refresh(false)
            }}
          />
        </Suspense>
      )}
      {!shared && (stream.online !== null || stream.sales.length > 0) && (
        <Suspense fallback={null}>
          <Signals key={site.id} site={site} online={stream.online} visits={stream.visits} sales={stream.sales} scope={site.id + range.from + range.to + filtersKey} sources={live && cur?.revenue_dims ? (cur.revenue_dims.channel ?? []).map((r) => r.value) : undefined} />
        </Suspense>
      )}
      {!shared && location.search.includes('import=ga') && (
        <Suspense fallback={null}>
          <GaReturn site={site} />
        </Suspense>
      )}
      {!shared && <MilestonesSlot ms={ms} site={site} quiet={waiting} revenue={mods === null || shows(mods, 'cards', 'revenue')} />}
      {view.test && (
        <Suspense fallback={null}>
          <Notices kind="test" onAct={() => setView({ test: false })} />
        </Suspense>
      )}
      {bounce && <Suspense fallback={null}><GuideModal site={site.id} domain={site.domain} qs={rangeQS(query)} onClose={() => setBounce(false)} /></Suspense>}
      <AskPanel open={askOn && askOpen} onClose={() => setAskOpen(false)} />
    </>
  )
}
