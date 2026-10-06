import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TimeChart } from '../charts/GuardedChart'
import { DatePicker, type PickerValue } from '../components/DatePicker'
import { api, cachedReport, dropReports, showsInstall, siteState, fail, type Segment as SavedView, type KPIs, type ReportQuery, type Row, type Site } from '../lib/api'
import { compareLabel, diffDays, fmtDay, setWeekStart, todayIn, type Range } from '../lib/dates'
import { countryName, fmtInt, fmtMoney } from '../lib/format'
import { journeysOn } from '../features/cookieless/labels'
import { unconvertedNote } from '../lib/money'
import { channelColor, channelLabel } from '../lib/palette'
import { navigate, readView, setView, useLocation, wantsLive } from '../lib/url'
import { exportQuery, queryOf, rangeOf, showsChange } from '../lib/dashQuery'
import { canAsk, isShared, isViewer } from '../lib/me'
import { useMods } from '../lib/useMods'
import { isOn, shows } from '../lib/modules'
import { FilterMenu } from '../components/FilterMenu'
import { toast } from '../components/Toast'
import { useLive, onlineNow } from '../lib/useLive'
import { useNarrow } from '../lib/useNarrow'
import { useReport } from '../lib/useReport'
import { useSample } from '../lib/useSample'
import { AskPanel } from './AskLazy'
import { pressed, useKeymap } from '../lib/keys'
import { Notice, StoppedNotice } from './DashboardParts'
import { extra } from '../features/extras/slots'
import { momentLayer } from '../features/moments/slots'
import { KpiStrip } from '../features/overview/KpiStrip'
import { visitorsHint } from '../features/overview/visitorsHint'
import { ChartHead } from '../features/overview/ChartHead'
import { ReplayButton, ScrubBar } from '../features/overview/Replay'
import { useReplayTimer, useSpeed } from '../features/overview/useReplay'
import { useRaceNow, useRaceRows } from '../features/overview/useRace'
import { RACE_DIMS, replaySeconds, speedOf } from '../features/overview/replayTime'
import { hourIn, hourlySpan, previousWhole } from '../features/overview/firstVisit'
import { chartMetric, ghostValues, metricName, metricProps, metricValues, type ChartMetric } from '../features/overview/chartMetric'
import { chartTips } from '../features/overview/chartTips'
import { useChartHold } from '../features/overview/reserve'
import { LiveSlot } from '../features/live/liveChunk'
import { useLivePulses } from '../features/live/useLivePulses'
import { OnlineKpi } from '../features/live/OnlineKpi'
import { entryCopy } from '../features/live/entryCopy'
import { liveShown } from '../features/live/liveShown'
import { useNotes } from '../features/notes/useNotes'
import { jump } from '../features/notes/jump'
import { ChartFoot } from '../features/overview/ChartFoot'
import { Loading } from '../components/loading/Loading'
import { lazyLoad, whenIdle } from '../lib/lazyLoad'
import type { CardsCtx } from '../features/cards/ctx'
import { DIM_LABEL } from '../features/overview/dimLabels'
import { activeChips, filterOps, siblingRows } from '../features/header/filterOps'
const CreateMenu = lazy(() => import('../features/create/CreateMenu').then((m) => ({ default: m.CreateMenu }))) // its key and item work once it is here, a moment after the page
import { MoreMenu } from '../components/MoreMenu'
import { downloadCsv } from '../lib/download'
import { ControlRow } from '../features/header/ControlRow'
import { savedViews } from '../components/panelOpen'
import { FilterRowHost } from '../features/header/FilterRowHost'
const SaveViewHost = lazy(() => import('../features/header/SaveViewHost').then((m) => ({ default: m.SaveViewHost }))) // a dialog: only when a view is named
import { HeaderTools, ShareButton } from '../features/header/HeaderTools'
import { MilestonesSlot } from '../features/milestones/MilestonesSlot'
import { useMilestones } from '../features/milestones/useMilestones'
import { filterFrom } from '../features/journey/filterFrom'
import { StorySlot } from '../features/storyview/StorySlot'

// Full mode's extra views live in their own chunk: Core never loads them.
// The share dialog is its own chunk: nothing of it loads until Share is pressed.
const Cards = lazyLoad(() => import('../features/cards/Cards').then((m) => ({ default: m.Cards }))) // the two cards under the chart: Explore's numbers, fetched when idle so the switch to Explore finds them here
whenIdle(Cards.preload)
const ShareDialog = lazy(() => import('../features/share/ShareDialog'))
const GaReturn = lazy(() => import('../features/install/GaReturn').then((m) => ({ default: m.GaReturn }))) // only on the way back from Google (?import=ga)
const Story = lazy(() => import('../features/story/Story')) // Replay as a story: loaded when Replay starts
const Install = lazy(() => import('../features/install/Install')) // new sites only: never in the first load
const Signals = lazy(() => import('../features/signals/Signals')) // the tab's count, the sale toast and the notices: once the stream has spoken
const AddGoals = lazy(() => import('./AddGoals').then((m) => ({ default: m.AddGoals })))
const NotesDialog = lazy(() => import('../features/notes/NotesList').then((m) => ({ default: m.NotesDialog })))
const NoteDialog = lazy(() => import('../components/NoteDialog').then((m) => ({ default: m.NoteDialog })))
// Full mode's live card, the save-view dialog and Live mode: each its own
// chunk, loaded when shown.
const JourneyDialog = lazy(() => import('../features/journey/JourneyDialog').then((m) => ({ default: m.JourneyDialog })))

/** A filter's value as people read it: a channel's or a country's name. */
function filterLabel(dim: string, v: string) {
  if (dim === 'channel') return channelLabel(v)
  return dim === 'country' ? countryName(v) : v
}

export function Dashboard({ site, sites, header }: { site: Site; sites: Site[]; header: React.ReactNode }) {
  // Before anything reads a date: "This week" starts on the site's own day.
  setWeekStart(site.week_start)
  useKeymap()
  const { params } = useLocation()
  const view = readView(params)
  const today = todayIn(site.timezone)
  const range: Range = useMemo(() => rangeOf(view, today), [view.period, view.from, view.to, today]) // eslint-disable-line react-hooks/exhaustive-deps -- view is new each render: keyed by the fields the range reads
  const full = view.mode === 'full'

  // Current and previous period come in one request (lib/dashQuery.ts).
  const compareOn = showsChange(view)
  const compareMode: Exclude<typeof view.compare, 'none'> = view.compare === 'none' ? 'previous' : view.compare
  const filtersKey = JSON.stringify(view.filters)
  const query: ReportQuery = useMemo(
    () => queryOf(view, range),
    [range.from, range.to, view.compare, view.cfrom, view.cto, view.period, filtersKey, view.test, view.bucket, view.attr, full], // eslint-disable-line react-hooks/exhaustive-deps -- view and range are new objects each render: keyed by content (filtersKey)
  )
  const live = range.to === today
  const { data: real, error, warming, loading, refresh } = useReport(site.id, query, { live })
  // Refresh (in ⋯) fetches every number again in place: the cache for this
  // site is dropped, the page, filters and dates stay; the bar at the top
  // shows it working.
  const reloadNow = () => {
    dropReports(site.id)
    refresh()
  }
  // A shared link has no session, so no stream (its report refreshes on a
  // timer); a new visit on the stream reloads the report past its cache.
  // The chart's hourly report (a short span, below) refreshes with it.
  const refreshHours = useRef<(skipCache: boolean) => void>(undefined)
  const stream = useLive(isShared() ? '' : site.id, () => {
    if (!live) return
    refresh(true)
    refreshHours.current?.(true)
  })

  // ---- a site with nothing in it yet ----
  // Until the first visit arrives we show a sample dashboard, lightly out of
  // focus, so the empty state looks like what it is about to become. The live
  // stream wakes it the moment a real visit lands.
  const firstLoad = !real && !error && !!site.last_event_at // a never-visited site shows its sample at once
  const curReal = real?.current
  const hasData = !!curReal && (curReal.kpis.sessions > 0 || (real?.previous?.kpis.sessions ?? 0) > 0)
  const mayBeNew = !firstLoad && !hasData && view.filters.length === 0
  // A shared link is only made for a site that already works.
  const [everTracked, setEverTracked] = useState<boolean | null>(() => (isShared() ? true : null))
  useEffect(() => {
    if (!mayBeNew || everTracked !== null) return
    api
      .events(site.id, 1)
      .then((r) => setEverTracked(r.events.length > 0))
      .catch(() => setEverTracked(true)) // on error, assume installed: never fake a working dashboard
  }, [mayBeNew, everTracked, site.id])
  const showInstall = showsInstall({ site, hasData, filtered: view.filters.length > 0, everTracked })
  const waiting = showInstall && stream.visits.length === 0
  const liveView = liveShown({ wanted: wantsLive(view, site), shared: isShared(), waiting }) // Data on a shared link, the install screen first
  const mods = useMods(site.id)
  const [journey, setJourney] = useState<string | null>(null)
  const [addGoals, setAddGoals] = useState(false)
  const [noteFor, setNoteFor] = useState<string | null>(null)
  // Saved views: the filters and period you keep coming back to.
  const [segments, setSegments] = useState<SavedView[]>([])
  const loadSegments = useCallback(() => {
    if (isShared()) return
    api
      .segments(site.id)
      .then((r) => setSegments(r.segments ?? []))
      .catch(() => setSegments([]))
  }, [site.id])
  useEffect(() => loadSegments(), [loadSegments])
  // Naming a view gets a real dialog. The browser's prompt() looks like it
  // belongs to some other website, and it cannot say what is being saved.
  const [naming, setNaming] = useState(false)
  const [sharing, setSharing] = useState(false)
  const ms = useMilestones(site)
  const saveView = () => setNaming(true)
  const current = location.search.replace(/^\?/, '')
  const openView = (g: SavedView) => navigate(location.pathname + '?' + (g.query || 'view=data'))
  const removeView = (g: SavedView) =>
    api
      .deleteSegment(site.id, g.id)
      .then(() => {
        toast(`Deleted "${g.name}"`)
        loadSegments()
      })
      .catch((e: unknown) => fail(e))
  const renameView = (g: SavedView, name: string) =>
    api
      .renameSegment(site.id, g.id, name)
      .then(() => {
        toast(`Renamed to "${name}"`)
        loadSegments()
      })
      .catch((e: unknown) => {
        fail(e)
        throw e
      })
  // The map is a module, and its outlines are a separate download, so it only
  // appears as a tab when the module is on.
  const mapOn = mods !== null && shows(mods, 'tabs', 'map')
  const notesOn = shows(mods, 'cards', 'notes') && (!isShared() || isOn(mods, 'notes'))
  // The Ask button follows its module: off means the entry point is gone too.
  // Ask is the MCP tools and an optional key, not a module: there is nothing to switch off.
  const askOn = canAsk()
  const sample = useSample(site, range.from, range.to, waiting)
  const data = waiting ? sample : real

  // ---- money trail: hover a source to preview where its visitors went ----
  const [trail, setTrail] = useState<string | null>(null)
  const trailQuery = useMemo(
    () => (trail ? { ...query, compare: undefined, filters: [...view.filters, { dim: 'channel', value: trail }] } : null),
    [trail, query, view.filters],
  )
  const trailReport = useReport(trail ? site.id : null, trailQuery)
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const onSourceHover = useCallback(
    (key: string | null) => {
      clearTimeout(hoverTimer.current)
      if (view.filters.some((f) => f.dim === 'channel')) return // already filtered to one channel
      if (key) {
        cachedReport(site.id, { ...query, compare: undefined, filters: [...view.filters, { dim: 'channel', value: key }] }).catch(() => {})
        hoverTimer.current = setTimeout(() => setTrail(key), 140)
      } else hoverTimer.current = setTimeout(() => setTrail(null), 220)
    },
    [site.id, query, view.filters],
  )
  // A new query drops the trail (set while rendering, the React way to reset
  // state when an input changes).
  const [trailQueryOf, setTrailQueryOf] = useState(query)
  if (trailQueryOf !== query) {
    setTrailQueryOf(query)
    setTrail(null)
  }
  const trailData = trail && trailReport.data && trailReport.data.from === data?.from ? trailReport.data : null

  // ---- scrubber / replay ----
  const cur = data?.current
  const canScrub = !!data && data.bucket === 'day' && (cur?.series.length ?? 0) > 1
  // Replay plays the chart as it is: by the hour when it is drawn by the hour,
  // by day from a new site's first visit (features/overview/useReplay). A chart
  // by week or month still offers it: pressing Replay switches to days, and
  // it starts once they have arrived.
  const canReplayByDay = !!data && !canScrub && data.bucket !== 'hour' && diffDays(range.from, range.to) >= 1 && diffDays(range.from, range.to) < 400
  const [replaySoon, setReplaySoon] = useState(false)
  const pickedDay = view.day
  const scrubIdx = canScrub && cur && pickedDay ? cur.series.findIndex((p) => p.t.startsWith(pickedDay)) : -1
  const scrubbing = scrubIdx >= 0
  // Notes on the chart: why that spike happened (in Core, once there are any).
  const showDay = useCallback((d: string) => jump(d, range, canScrub, today), [range, canScrub, today])
  const { notes, load: loadNotes } = useNotes(site.id, range, showDay)
  const [notesOpen, setNotesOpen] = useState(false)

  // ---- live pulse ----
  const pulsing = live && !scrubbing && !isShared()
  const pulses = useLivePulses(stream, pulsing)
  const [playing, setPlaying] = useState(false)
  const [story, setStory] = useState<'off' | 'on' | 'end'>('off')
  const [stops, setStops] = useState<number[]>([]) // the story's moments: reduced motion steps through them
  const [speed, pickSpeed] = useSpeed(playing)
  // By the hour, the point playing is the page's own: a day in the address would redraw the chart by day.
  const [hourAt, setHourAt] = useState<number | null>(null)
  const setDayIdx = useCallback(
    (i: number | null) => {
      if (!cur) return
      setView({ day: i == null ? undefined : cur.series[i]?.t.slice(0, 10) })
    },
    [cur],
  )

  // Replay pressed on a chart by week: it starts once the days have arrived.
  if (replaySoon && canScrub) {
    setReplaySoon(false)
    setPlaying(true)
  }

  const [askOpen, setAskOpen] = useState(false)
  // ---- keyboard: ⌘K opens Ask, F toggles Core/Full, Esc clears scrub ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (askOn && pressed(e, 'ask')) {
        e.preventDefault()
        setAskOpen((o) => !o)
        return
      }
      if ((e.target as HTMLElement).closest('input, textarea, select')) return
      if (pressed(e, 'mode')) setView({ mode: full ? 'core' : 'full' })
      if (e.key === 'Escape' && view.day) setView({ day: undefined })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [full, view.day, askOn])

  const pickerValue: PickerValue = {
    period: view.period,
    range,
    compare: view.compare,
    compareCustom: view.cfrom && view.cto ? { from: view.cfrom, to: view.cto } : undefined,
  }
  const onPicker = (v: PickerValue) => {
    setPlaying(false)
    setStory('off')
    setHourAt(null)
    const preset = v.period !== 'custom'
    // "Now" is the live view: today, by the hour. That hour is Now's, not
    // a choice the person made, so leaving Now leaves it behind — a month
    // drawn in 700 hourly points is not what anybody asked for.
    let bucket = view.bucket
    if (v.period === 'now') bucket = 'hour'
    else if (view.period === 'now') bucket = undefined
    setView({
      period: v.period,
      from: preset ? undefined : v.range.from,
      to: preset ? undefined : v.range.to,
      compare: v.compare,
      cfrom: v.compare === 'custom' ? v.compareCustom?.from : undefined,
      cto: v.compare === 'custom' ? v.compareCustom?.to : undefined,
      day: undefined,
      bucket,
    })
  }

  const addFilter = (dim: string, value: string) => {
    setTrail(null)
    const rest = view.filters.filter((f) => f.dim !== dim)
    setView({ filters: [...rest, { dim, value }], day: undefined })
  }
  // A filter only an off module produces (a goal, with Goals off) would
  // narrow the report to nothing that can be shown: it goes, as the card did.
  useEffect(() => {
    if (!mods) return
    const keep = view.filters.filter((f) => shows(mods, 'filters', f.dim))
    if (keep.length !== view.filters.length) setView({ filters: keep })
  }, [mods, view.filters])
  // ---- what the numbers show right now: whole period, scrubbed day, or trail ----
  const src = trailData?.current ?? cur
  const day = scrubbing ? src?.days?.find((d) => d.date === view.day) : undefined
  // While Replay tells the period (features/story), the page races to the
  // playhead: tiles count up, lists overtake (features/overview/useRace).
  // A day picked by hand shows that day alone.
  const telling = story === 'on'
  const racing = telling && scrubbing
  const raceTo = racing ? scrubIdx : -1
  let k: KPIs | undefined = src?.kpis
  if (scrubbing) k = day?.kpis ?? zeroKPIs
  // Nothing at all before: no change to show, not "new" on every tile.
  const before = data?.previous
  const hasPrev = compareOn && !scrubbing && !trailData && (before?.kpis.sessions ?? 0) > 0 && previousWhole(before?.series.map((p) => p.visitors) ?? [], data?.bucket ?? 'day')
  const pk = hasPrev ? data?.previous?.kpis : undefined
  const race = useRaceRows(src, raceTo)
  const soFar = racing ? 'So far' : undefined
  const dims = (dim: string): Row[] => {
    // Goals are their own list rather than a breakdown, but they filter like
    // any other dimension, so the filter menu asks for them the same way.
    if (dim === 'goal') return (scrubbing ? null : (src?.goals ?? null)) ?? []
    if (racing) return race[dim] ?? []
    if (scrubbing) return (day?.dims?.[dim] ?? null) ?? []
    return (src?.dims?.[dim] ?? null) ?? []
  }
  const perDay = (dim: string) => !scrubbing || RACE_DIMS.includes(dim)

  // ---- money (once a payment provider is connected) ----
  const money = mods === null || shows(mods, 'cards', 'revenue') ? src?.money : undefined
  const pm = hasPrev ? data?.previous?.money : undefined
  const fmtM = (minor: number) => (money ? fmtMoney(minor, money.currency, money.exponent) : '')
  let dayRev: number | undefined
  if (scrubbing) dayRev = day?.money?.revenue ?? 0

  // ---- chart ----
  const series = cur?.series ?? []
  // Three days or fewer by day is a triangle: drawn by the hour instead,
  // unless a day is picked (a replay by day too) or the bucket was picked by hand.
  const byHour = !!data && data.bucket === 'day' && !view.bucket && !scrubbing && hourlySpan(range.from, range.to)
  const hourQuery = useMemo(
    () => (byHour ? { ...query, daily: false, deep: false, bucket: 'hour' as const } : null),
    [byHour, query],
  )
  const hourly = useReport(byHour ? site.id : null, hourQuery, { live })
  useEffect(() => {
    refreshHours.current = hourly.refresh
  })
  const hours = byHour && hourly.data?.bucket === 'hour' ? hourly.data : null
  // By the hour, the chart stops at the hour it is now: the rest of today
  // has not happened, and is not a drop to zero.
  const nowHour = hourIn(site.timezone)
  const chartSeries = hours ? hours.current.series.filter((p) => p.t.slice(0, 13) <= nowHour) : series
  // What the chart shows follows the address, when this page can draw it (chartMetric).
  const canDraw = { money: !!money, days: !hours && data?.bucket === 'day' && !!cur?.days }
  const metric = chartMetric(view.metric, canDraw)
  const pick = (m: ChartMetric) => setView({ metric: m === 'visitors' ? undefined : m })
  // Revenue is what src says (a followed channel's own, like the tiles), by the hour what that hour says.
  const revenue = (hours ? chartSeries : (src?.series ?? [])).map((p) => p.revenue ?? 0)
  const values = metricValues(metric, { series: chartSeries, revenue, days: cur?.days })
  const { raced, follow, blank } = useRaceNow({ src, dates: series.map((p) => p.t.slice(0, 10)), hourSeries: chartSeries, hours: !!hours, hourAt, idx: scrubIdx, telling, racing, playing })
  if (raced) [k, dayRev] = [raced.kpis, raced.revenue]
  const revenueNow = dayRev ?? money?.revenue
  const conv = scrubbing ? undefined : money?.conversion
  const soFarRpv = k?.visitors ? (dayRev ?? 0) / k.visitors : 0
  const rpv = scrubbing || raced ? soFarRpv : money?.revenue_per_visitor
  const replayPoints = hours ? chartSeries.length : series.length
  const settle = useReplayTimer({ playing, secs: replaySeconds(replayPoints, speedOf(speed).secs), first: 0, n: hours ? chartSeries.length : series.length, at: hours ? (hourAt ?? -1) : scrubIdx, step: hours ? setHourAt : setDayIdx, done: () => {
    setPlaying(false)
    setStory('end')
  }, stops })
  const jumpTo = (i: number) => {
    setPlaying(false)
    if (hours) setHourAt(i)
    else setDayIdx(i)
  }
  const stopStory = () => {
    setPlaying(false)
    setStory('off')
    setHourAt(null)
    setDayIdx(null)
  }
  const again = () => {
    setStory('on')
    setPlaying(true)
  }
  let chartScrub = scrubbing && !hours ? scrubIdx : null
  if (hours) chartScrub = hourAt
  const prevSeries = compareOn ? (hours ?? data)?.previous?.series : undefined
  const ghost = ghostValues(metric, prevSeries)
  const overlay = trail && trailData && (metric === 'visitors' || metric === 'pageviews')
    ? { values: trailData.current.series.map((p) => p[metric]), color: channelColor(trail), name: channelLabel(trail) }
    : undefined

  const narrow = useNarrow()
  const name = metricName(metric)
  const hold = useChartHold({ site: site.id, mods, narrow, view, range, loaded: !!real, hasRevenue: !!money })
  // Replay's controls stay out while nothing is playing or picked.
  const active = playing || telling || scrubbing || (!!hours && hourAt !== null)
  const rows = full ? 12 : 5
  // The same words the date picker shows ("vs last year" for This year), so
  // the tiles, the chart legend and a shared card never disagree with it.
  const vs = 'vs ' + compareLabel(pickerValue.period, compareMode, pickerValue.range)
  const online = onlineNow(stream, data?.online, real?.online)

  // Hover must never change the Sources card's height (see its note below).
  // Following a channel, Sources keeps every channel, the followed one lit.
  const sourceRows = (dim: string): Row[] => {
    if (!perDay(dim)) return []
    return trailData && dim === 'channel' ? (cur?.dims.channel ?? []) : dims(dim)
  }

  // What the two cards under the chart read from this page.
  const cardsCtx: CardsCtx = {
    site, query, bucket: data?.bucket ?? 'day', full, shared: isShared(), deep: full && hasData && !isShared(), loading: firstLoad, scrubbing, mods, money, fmtMoney: fmtM,
    rows, soFar, cur, prev: compareOn && !trail ? data?.previous : undefined, compare: compareOn, dims, sourceRows, perDay, trail, dimTrail: !!trail, onSourceHover, addFilter, mapOn,
    goals: src?.goals ?? [], revenueDims: src?.revenue_dims ?? {}, countryRevenue: src?.revenue_dims?.country ?? [],
    attrFirst: view.attr === 'first', onAttr: (first) => setView({ attr: first ? 'first' : undefined }), onTrackGoal: () => setAddGoals(true), onFull: () => setView({ mode: 'full' }),
    steps: view.funnel ?? [], onSteps: (f) => setView({ funnel: f }), onPickVisitor: setJourney, visitors: k?.visitors ?? 0,
  }

  const clearFilters = () => setView({ filters: [] })
  const rowProps = {
    filters: view.filters, dimLabel: (dim: string) => DIM_LABEL[dim] ?? dim, valueLabel: filterLabel, onRemove: filterOps.dropSet, onFlip: filterOps.flip, onClear: clearFilters, onSave: saveView,
    views: isShared() ? undefined : { list: segments, current, onOpen: openView, onRename: renameView, onDelete: removeView },
  }

  // The mode is a property of the page, not of one card: everything from grid
  // density to card padding follows it.
  useEffect(() => {
    document.body.dataset.mode = full ? 'full' : 'core'
    return () => {
      delete document.body.dataset.mode
    }
  }, [full])

  // The second row (a shared link on a desktop has it in the header's row); before the first visit there is nothing to switch or date, so it waits.
  const controls = !waiting && (
    <ControlRow
      live={liveView}
      phone={narrow}
      value={pickerValue}
      today={today}
      onChange={onPicker}
      active={activeChips(view.filters, filterLabel)}
      under={(view.filters.length > 0 || !!rowProps.views?.list.length) && <FilterRowHost {...rowProps} onlyViews={narrow} />}
      filter={!isShared() && <FilterMenu rows={dims} siblings={siblingRows(site.id, query)} labelFor={filterLabel} active={view.filters} onPick={filterOps.pick} onRemove={filterOps.dropValue} onClear={clearFilters} />}
      period={<DatePicker value={pickerValue} today={today} onChange={onPicker} short={narrow} tz={site.timezone} site={site.id} bucket={view.bucket} autoBucket={data?.bucket} onBucket={(b) => setView({ bucket: b })} />}
      share={!isShared() && !narrow && <ShareButton onShare={() => setSharing(true)} />}
      more={
        <MoreMenu
          full={full}
          onShare={narrow && !isShared() ? () => setSharing(true) : undefined}
          onViews={narrow && !isShared() && segments.length > 0 ? () => savedViews.set(true) : undefined}
          milestones={ms.on ? { open: ms.openList, dot: ms.dot } : undefined}
          onMode={(m) => setView({ mode: m })} onRefresh={reloadNow}
          onExport={() => downloadCsv(site.id, exportQuery(view, query))}
        />
      }
    />
  )
  const inHeader = isShared() && !narrow
  return (
    <>
      {!liveView && (firstLoad || loading) && <div className="loadbar" role="status" aria-label="Loading" />/* Live loads no report: it shows its own connection */}
      <div className="header quiet">
        {header}
        <HeaderTools
          live={liveView}
          waiting={waiting} site={site}
          askOpen={askOpen}
          onAsk={() => setAskOpen(true)}
          extra={trail && trailData && (
            <button type="button" className="chip" style={{ borderColor: channelColor(trail) }} title={`Following ${channelLabel(trail)}: click to keep`} onClick={() => addFilter('channel', trail)}>
              <span className="dot" style={{ background: channelColor(trail) }} />
              <b>{channelLabel(trail)}</b>
            </button>
          )}
        />
        {inHeader && controls}
        {!liveView && !waiting && <Suspense fallback={null}><CreateMenu pages={dims('entry_page')} goals={src?.goals ?? []} modules={mods} onGoal={() => setAddGoals(true)} onNote={() => setNoteFor(view.day ?? today)} onFunnel={(f) => setView({ mode: 'full', funnel: f })} /></Suspense>}
      </div>

      {!inHeader && controls}

      {liveView && (
        <LiveSlot key={site.id} site={site.id} timezone={site.timezone} cookieless={site.cookieless} stream={stream} onVisitor={journeysOn(site, mods !== null && shows(mods, 'cards', 'journey')) ? setJourney : undefined} />
      )}
      {!liveView && <>
      {sharing && <Suspense fallback={null}><ShareDialog site={site} sites={sites} onClose={() => setSharing(false)} /></Suspense>}
      {naming && <Suspense fallback={null}><SaveViewHost site={site.id} query={current} onClose={() => setNaming(false)} onSaved={loadSegments} /></Suspense>}
      {error && <Notice kind="error" text={error} />}
      {warming && <Notice kind="warming" />}
      {showInstall && <Suspense fallback={null}><Install site={site} visits={stream.visits} /></Suspense>}
      {!isShared() && location.search.includes('import=ga') && <Suspense fallback={null}><GaReturn site={site} /></Suspense>}
      <MilestonesSlot ms={ms} site={site} quiet={showInstall} revenue={mods === null || shows(mods, 'cards', 'revenue')} />
      {!showInstall && !isShared() && siteState(site) === 'stopped' && <StoppedNotice site={site} />}

      {view.test && <Notice kind="test" onAct={() => setView({ test: false })} />}
      {money && money.unconverted > 0 && (
        <div className="banner">{unconvertedNote(money)}</div>
      )}

      <StorySlot view={view} site={site} query={query} data={real} range={range} ready={hasData && !showInstall} waiting={waiting} loading={loading || firstLoad} money={money ? fmtM : undefined} narrow={narrow} onGoal={() => setAddGoals(true)}>
      {/* One section for the period at a glance: the key numbers across the
          top, the chart under them — they are one story, not two cards. */}
      <section className="card overview" aria-label="Overview">
      <KpiStrip
        loading={firstLoad} vs={vs} metric={metric} can={canDraw} onPick={pick} expectMoney={hold.revenue}
        k={k} pk={pk} money={money} pm={pm} revenue={revenueNow} conv={conv} rpv={rpv} follow={follow} blank={blank} site={site} bots={data?.bots}
        pace={live && !isShared() ? extra({ part: 'pace', site: site.id, today, filters: query.filters, test: query.testPayments }) : undefined}
        hint={compareOn && !scrubbing && !raced && !trailData ? visitorsHint({ site: site.id, period: view.period, day: range.to, filters: view.filters }) : undefined}
        // A shared page has no live stream, so it says where the number comes from instead of waiting to connect forever.
        online={<OnlineKpi online={online} canOpen={!isShared()} note={stream.connected || isShared() ? entryCopy.onlineNote : entryCopy.connecting} />}
      />

      <div className={active ? 'overview-chart replaying' : 'overview-chart'} role="group" aria-label={`${name} over time`}>
        <ChartHead title={name}>
          {(canScrub || canReplayByDay) && (
            <ReplayButton
              playing={playing}
              byDay={!canScrub}
              byHour={!!hours}
              speed={speed} points={canScrub ? replayPoints : diffDays(range.from, range.to) + 1}
              onSpeed={pickSpeed}
              onPlay={() => {
                if (!playing) setStory('on')
                if (playing) settle()
                if (canScrub) return setPlaying((p) => !p)
                setReplaySoon(true)
                setView({ bucket: 'day' })
              }}
            />
          )}
        </ChartHead>
        {/* Until a short span's hours, or the notes that may move a new
            site's start, arrive: never one chart first, then a jump. */}
        {firstLoad || (byHour && !hours) ? (
          <Loading height={hold.height} />
        ) : (
          <TimeChart
            height={narrow ? 170 : 220}
            labels={chartSeries.map((p) => p.t)}
            values={values}
            ghost={ghost}
            ghostLabels={prevSeries?.map((p) => p.t)}
            overlay={hours ? undefined : overlay}
            metric={name}
            bucket={hours ? 'hour' : (data?.bucket ?? 'day')}
            scrub={chartScrub}
            story={telling}
            locked={playing}
            partialLast={live}
            {...metricProps(metric, money, revenue)}
            notes={notesOn ? notes : []}
            layer={isShared() || telling ? undefined : momentLayer({ site, query, labels: chartSeries.map((p) => p.t), series: chartSeries, bucket: hours ? 'hour' : (data?.bucket ?? 'day'), money: fmtM, onShare: () => setSharing(true) })}
            onAddNote={isShared() || isViewer() || !notesOn ? undefined : (day) => setNoteFor(day)}
            pulses={pulses}
            {...chartTips({ series: chartSeries, hours: !!hours, byDay: data?.bucket === 'day', days: cur?.days, site, money, metric })}
            onScrub={
              canScrub && full && !hours
                ? (i) => {
                    setPlaying(false)
                    setDayIdx(i)
                  }
                : undefined
            }
          />
        )}
        {story !== 'off' && (
          <Suspense fallback={null}>
            <Story site={site.id} query={query} bucket={hours ? 'hour' : 'day'} labels={chartSeries.map((p) => p.t)} visitors={chartSeries.map((p) => p.visitors)} at={chartScrub} playing={playing} phase={story}
              money={money ? fmtM : undefined} total={fmtInt(src?.kpis.visitors ?? 0)} source={cur?.dims.channel?.[0]?.value} period={[chartSeries[0]?.t.slice(0, 10) ?? range.from, range.to]}
              onJump={jumpTo} onStops={setStops} onStop={stopStory} onAgain={again} onShare={() => setSharing(true)} />
          </Suspense>
        )}
        {canScrub && (
          <ScrubBar
            n={series.length}
            at={Math.max(-1, scrubIdx)}
            day={scrubbing && view.day ? fmtDay(view.day, { weekday: true }) : undefined}
            onScrub={(i) => {
              setPlaying(false)
              setDayIdx(i)
            }}
          />
        )}
        <ChartFoot
          notes={!showInstall && !isShared() && notesOn && (full || notes.length > 0) ? { count: notes.length, onAdd: isViewer() ? undefined : () => setNoteFor(view.day ?? today), onOpen: () => setNotesOpen(true) } : undefined}
          day={canScrub && scrubbing && view.day ? fmtDay(view.day, { weekday: true }) : undefined} imported={cur?.imported}
          onBack={() => { setStory('off'); setPlaying(false); setHourAt(null); setDayIdx(null) }}
        />
      </div>
      </section>

      {notesOpen && notesOn && (
        <Suspense fallback={null}>
          <NotesDialog site={site} onJump={showDay} onChanged={loadNotes} onClose={() => setNotesOpen(false)} onAdd={isViewer() ? undefined : () => { setNotesOpen(false); setNoteFor(view.day ?? today) }} />
        </Suspense>
      )}
      {noteFor && notesOn && (
        <Suspense fallback={null}>
        <NoteDialog
          site={site}
          day={noteFor}
          today={today}
          // The strip only makes sense by day; an hourly view gets the
          // date picker alone.
          days={data?.bucket === 'day' ? series.map((pt) => ({ day: pt.t.slice(0, 10), visitors: pt.visitors })) : []}
          notes={notes}
          onClose={() => setNoteFor(null)}
          onSaved={loadNotes}
        />
        </Suspense>
      )}

      {hasData && <Suspense fallback={<div aria-hidden="true" style={{ minHeight: 325 }} />}><Cards c={cardsCtx} /></Suspense>}
      </StorySlot>
      {cur?.approximate && <Notice kind="approx" />}
      </>}

      {journey && mods !== null && shows(mods, 'cards', 'journey') && (
        <Suspense fallback={null}>
          <JourneyDialog site={site} visitor={journey} query={query} onClose={() => setJourney(null)} onFilter={(dim, value) => { setTrail(null); filterFrom(view, dim, value) }} />
        </Suspense>
      )}

      {addGoals && shows(mods, 'cards', 'goals') && (
        <Suspense fallback={null}>
          <AddGoals site={site} pages={(cur?.dims.page ?? []).map((r) => r.value)} onClose={() => setAddGoals(false)} onChanged={() => {
            dropReports(site.id)
            refresh()
          }} />
        </Suspense>
      )}

      {!isShared() && (stream.online !== null || stream.sales.length > 0) && (
        <Suspense fallback={null}>
          <Signals key={site.id} site={site} online={stream.online} visits={stream.visits} sales={stream.sales} scope={site.id + range.from + range.to + filtersKey} sources={live && !scrubbing && cur?.revenue_dims ? (cur.revenue_dims.channel ?? []).map((r) => r.value) : undefined} />
        </Suspense>
      )}
      <AskPanel open={askOn && askOpen} onClose={() => setAskOpen(false)} />
    </>
  )
}

const zeroKPIs: KPIs = { visitors: 0, sessions: 0, pageviews: 0, bounce_rate: 0, avg_session_s: 0, views_per_session: 0, new_visitor_share: 0 }
