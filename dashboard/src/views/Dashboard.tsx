import { Banknote, ChevronDown, ChevronRight, Coins, CornerUpLeft, Eye, Target, Timer, Users } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BarList, type BarItem } from '../charts/BarList'
import { TimeChart, type Pulse } from '../charts/TimeChart'
import { DatePicker, type PickerValue } from '../components/DatePicker'
import { api, cachedReport, dropReports, messageOf, showsInstall, siteState, type Filter, type Segment as SavedView, type KPIs, type ReportQuery, type Row, type Site } from '../lib/api'
import { compareLabel, diffDays, fmtDay, setWeekStart, todayIn, type Range } from '../lib/dates'
import { countryName, delta, flag, fmtDuration, fmtInt, fmtMoney, fmtPct } from '../lib/format'
import { journeysOn, newShare, newShareShort, newVsReturning } from '../features/cookieless/labels'
import { unconvertedNote } from '../lib/money'
import { channelColor, channelLabel } from '../lib/palette'
import { navigate, readView, setView, useLocation } from '../lib/url'
import { queryOf, rangeOf } from '../lib/dashQuery'
import { canAsk, canChange, isShared, isViewer, sharedModules } from '../lib/me'
import { openSettings } from '../lib/settings'
import { isOn, shows } from '../lib/modules'
import { FilterMenu } from '../components/FilterMenu'
import { toast } from '../components/Toast'
import { useLive, onlineNow } from '../lib/useLive'
import { useReport } from '../lib/useReport'
import { useSample } from '../lib/useSample'
import { AskPanel } from './AskLazy'
import { caps, keyFor, pressed, useKeymap } from '../lib/keys'
import { SearchTerms, StoppedNotice } from './DashboardParts'
import { JumpNav } from '../features/fullcharts/JumpNav'
import { KpiTile } from '../features/overview/KpiTile'
import { ChartHead } from '../features/overview/ChartHead'
import { ReplayButton, ScrubBar } from '../features/overview/Replay'
import { useReplayTimer, useSpeed } from '../features/overview/useReplay'
import { useRaceNow, useRaceRows, RACE_DIMS } from '../features/overview/useRace'
import { replaySeconds, speedOf } from '../features/overview/replayTime'
import { firstVisitAt, hourIn, hourlySpan } from '../features/overview/firstVisit'
import { hourDetail } from '../features/overview/hourDetail'
import { LiveSlot } from '../features/live/liveChunk'
import { OnlineKpi } from '../features/live/OnlineKpi'
import { entryCopy } from '../features/live/entryCopy'
import { liveShown } from '../features/live/liveShown'
import { useNotes } from '../features/notes/useNotes'
import { jump } from '../features/notes/jump'
import { Behaviour } from '../features/behaviour/Behaviour'
import { NoteBar } from '../features/notes/NoteBar'
import { Loading } from '../components/loading/Loading'
import { FullGrid } from '../features/fullcharts/FullGrid'
import { CreateMenu } from '../features/create/CreateMenu'
import { MoreMenu } from '../components/MoreMenu'
import { downloadCsv } from '../lib/download'
import { HeaderTools } from '../features/header/HeaderTools'
import { MilestonesSlot } from '../features/milestones/MilestonesSlot'
import { useMilestones } from '../features/milestones/useMilestones'
import { ViewSwitch } from '../features/live/ViewSwitch'
import { filterFrom } from '../features/journey/filterFrom'

// Full mode's extra views live in their own chunk: Core never loads them.
// The share dialog is its own chunk: nothing of it loads until Share is pressed.
const ShareDialog = lazy(() => import('../features/share/ShareDialog'))
const Story = lazy(() => import('../features/story/Story')) // Replay as a story: loaded when Replay starts
const Install = lazy(() => import('../features/install/Install')) // new sites only: never in the first load
const WorldMap = lazy(() => import('./WorldMap').then((m) => ({ default: m.WorldMap })))
const AddGoals = lazy(() => import('./AddGoals').then((m) => ({ default: m.AddGoals })))
const NotesDialog = lazy(() => import('../features/notes/NotesList').then((m) => ({ default: m.NotesDialog })))
const NoteDialog = lazy(() => import('../components/NoteDialog').then((m) => ({ default: m.NoteDialog })))
// Full mode's live card, the save-view dialog and Live mode: each its own
// chunk, loaded when shown.
const FullCharts = lazy(() => import('../features/fullcharts/FullCharts')) // Full mode's chart grid: its own chunk
const FilterRow = lazy(() => import('../features/header/FilterRow')) // only with filters or saved views
const SaveViewDialog = lazy(() => import('../components/SaveViewDialog').then((m) => ({ default: m.SaveViewDialog })))
const JourneyDialog = lazy(() => import('../features/journey/JourneyDialog').then((m) => ({ default: m.JourneyDialog })))
const ScrollDepth = lazy(() => import('./ScrollDepth').then((m) => ({ default: m.ScrollDepth }))) // Pages → Scroll: Full only

const DIM_LABEL: Record<string, string> = {
  channel: 'Channel',
  referrer: 'Referrer',
  campaign: 'Campaign',
  entry_page: 'Entry page',
  exit_page: 'Exit page',
  page: 'Page',
  group: 'Section',
  country: 'Country',
  device: 'Device',
  browser: 'Browser',
  os: 'OS',
  goal: 'Goal',
  utm_source: 'utm_source',
  utm_medium: 'utm_medium',
}

// The Locations card's column heading.
const PLACE_LABEL: Record<string, string> = { country: 'Country', region: 'Region', city: 'City' }

/** A filter's value as people read it: a channel's or a country's name. */
function filterLabel(dim: string, v: string) {
  if (dim === 'channel') return channelLabel(v)
  return dim === 'country' ? countryName(v) : v
}

/** A row's conversion: customers per visitor. */
const convOf = (r: Row) => (r.visitors ? (r.customers ?? 0) / r.visitors : 0)

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
  const compareOn = view.compare !== 'none'
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
  // Full with data shows only its grid; a shared link cannot load the charts.
  const chartsOnly = full && hasData && !isShared()
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
  const liveView = liveShown({ wanted: !!view.live, shared: isShared(), waiting }) // Data on a shared link, the install screen first
  const [mods, setMods] = useState<Partial<Record<string, boolean>> | null>(() => (isShared() ? sharedModules() : null))
  useEffect(() => {
    if (mods) return
    if (isShared()) return // the link carried them
    api
      .modules(site.id)
      .then((d) => setMods(Object.fromEntries(d.modules.map((m) => [m.id, m.enabled]))))
      .catch(() => setMods({})) // a module view that 404s simply hides itself
  }, [full, mods, site.id])
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
  useEffect(() => {
    loadSegments()
  }, [loadSegments])
  // Naming a view gets a real dialog. The browser's prompt() looks like it
  // belongs to some other website, and it cannot say what is being saved.
  const [naming, setNaming] = useState(false)
  const [sharing, setSharing] = useState(false)
  const ms = useMilestones(site)
  const saveView = () => setNaming(true)
  const current = location.search.replace(/^\?/, '')
  const openView = (g: SavedView) => navigate(location.pathname + '?' + g.query)
  const removeView = (g: SavedView) =>
    api
      .deleteSegment(site.id, g.id)
      .then(() => {
        toast(`Deleted "${g.name}"`)
        loadSegments()
      })
      .catch((e: unknown) => toast(messageOf(e), 'error'))
  const renameView = (g: SavedView, name: string) =>
    api
      .renameSegment(site.id, g.id, name)
      .then(() => {
        toast(`Renamed to "${name}"`)
        loadSegments()
      })
      .catch((e: unknown) => {
        toast(messageOf(e), 'error')
        throw e
      })
  // Full mode has every number, but not all at once: the secondary ones stay
  // folded until asked for, and the choice is remembered.
  const [moreOpen, setMoreOpen] = useState(() => {
    try {
      return localStorage.getItem('trckable:more') === '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('trckable:more', moreOpen ? '1' : '0')
    } catch {
      /* private mode */
    }
  }, [moreOpen])
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
  const { notes, load: loadNotes, ready: notesReady } = useNotes(site.id, range, showDay)
  const [notesOpen, setNotesOpen] = useState(false)

  // ---- live pulse ----
  // Things arriving while you watch, drawn rising from today's point. Only
  // when the chart ends at now and is not showing a single past day — a dot
  // rising from last Tuesday would be a lie.
  const pulsing = live && !scrubbing && !isShared()
  const [pulses, setPulses] = useState<Pulse[]>([])
  const addPulse = useCallback((pl: Pulse) => {
    setPulses((ps) => [...ps.slice(-14), pl])
    setTimeout(() => setPulses((ps) => ps.filter((x) => x.id !== pl.id)), 2400)
  }, [])
  // The stream starts empty and only ever carries what happens after the page
  // opened, so every visit it delivers is news; ids start at 1.
  const lastVisit = useRef(0)
  const lastSale = useRef(0)
  // Events are written in small batches, so several can reach the page in one
  // render. Each one gets its own pulse — up to a handful, staggered so a
  // burst reads as a burst — rather than only the newest.
  useEffect(() => {
    const fresh = stream.visits.filter((v) => v.id > lastVisit.current)
    if (!fresh.length) return
    lastVisit.current = fresh[0].id
    if (!pulsing) return
    fresh
      .slice(0, 6)
      .reverse()
      .forEach((v, i) => setTimeout(() => addPulse({ id: `v${v.id}`, kind: v.kind === 'goal' ? 'goal' : 'visit' }), i * 140))
  }, [stream.visits, pulsing, addPulse])
  useEffect(() => {
    const fresh = stream.sales.filter((x) => x.id > lastSale.current)
    if (!fresh.length) return
    lastSale.current = fresh[0].id
    if (!pulsing) return
    fresh
      .slice(0, 4)
      .reverse()
      .forEach((x, i) => setTimeout(() => addPulse({ id: `s${x.id}`, kind: 'sale', label: '+' + fmtMoney(x.amount, x.currency, x.exponent) }), i * 400))
  }, [stream.sales, pulsing, addPulse])
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

  const [metric, setMetric] = useState<'visitors' | 'pageviews'>('visitors')

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
  const removeFilter = (f: Filter) => setView({ filters: view.filters.filter((x) => x !== f && !(x.dim === f.dim && x.value === f.value)) })

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
  const hasPrev = !scrubbing && !trailData && (data?.previous?.kpis.sessions ?? 0) > 0
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
  // A site that began inside the period: the chart and the tiles' lines start
  // at its first visit, not at a month of zeros (features/overview).
  // A note on a day before that first visit (the launch, say) keeps its day.
  const firstVisit = waiting ? 0 : firstVisitAt(series.map((p) => p.visitors), data?.previous?.kpis.visitors, view.filters.length > 0 || compareMode !== 'previous')
  const noteDay = notes.map((n) => n.day).filter((d) => d >= range.from).sort()[0]
  let fv = firstVisit
  if (fv > 0 && noteDay) fv = Math.min(fv, Math.max(0, series.findIndex((p) => p.t.slice(0, 10) >= noteDay)))
  const firstDay = fv > 0 ? series[fv].t.slice(0, 10) : undefined
  const shown = series.slice(fv)
  // Each number's own day-by-day line, for the small spark in its tile.
  const dayRows = (cur?.days ?? []).filter((d) => !firstDay || d.date >= firstDay)
  const sparkOf = (f: (d: (typeof dayRows)[number]) => number) => (dayRows.length > 1 ? dayRows.map(f) : undefined)
  // Three days or fewer by day is a triangle: drawn by the hour instead,
  // unless a day is picked (a replay by day too) or the bucket was picked by hand.
  const byHour = !!data && data.bucket === 'day' && !view.bucket && !scrubbing && hourlySpan(firstDay ?? range.from, range.to)
  const hourQuery = useMemo(
    () => (byHour ? { ...query, from: firstDay ?? query.from, compare: firstDay ? undefined : query.compare, daily: false, deep: false, bucket: 'hour' as const } : null),
    [byHour, query, firstDay],
  )
  const hourly = useReport(byHour ? site.id : null, hourQuery, { live })
  useEffect(() => {
    refreshHours.current = hourly.refresh
  })
  const hours = byHour && hourly.data?.bucket === 'hour' ? hourly.data : null
  // By the hour, the chart stops at the hour it is now: the rest of today
  // has not happened, and is not a drop to zero.
  const nowHour = hourIn(site.timezone)
  const chartSeries = hours ? hours.current.series.filter((p) => p.t.slice(0, 13) <= nowHour) : shown
  const values = chartSeries.map((p) => p[metric])
  const { raced, follow } = useRaceNow({ src, dates: shown.map((p) => p.t.slice(0, 10)), hourSeries: chartSeries, hours: !!hours, hourAt, idx: scrubIdx - fv, telling, racing, playing })
  if (raced) [k, dayRev] = [raced.kpis, raced.revenue]
  const revenueNow = dayRev ?? money?.revenue
  const conv = scrubbing ? undefined : money?.conversion
  const soFarRpv = k?.visitors ? (dayRev ?? 0) / k.visitors : 0
  const rpv = scrubbing || raced ? soFarRpv : money?.revenue_per_visitor
  const replayPoints = hours ? chartSeries.length : series.length - fv
  const settle = useReplayTimer({ playing, secs: replaySeconds(replayPoints, speedOf(speed).secs), first: hours ? 0 : fv, n: hours ? chartSeries.length : series.length, at: hours ? (hourAt ?? -1) : scrubIdx, step: hours ? setHourAt : setDayIdx, done: () => {
    setPlaying(false)
    setStory('end')
  }, stops: stops.map((i) => i + (hours ? 0 : fv)) })
  const jumpTo = (i: number) => {
    setPlaying(false)
    if (hours) setHourAt(i)
    else setDayIdx(i + fv)
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
  let chartScrub = scrubbing && !hours ? scrubIdx - fv : null
  if (hours) chartScrub = hourAt
  const prevSeries = compareOn && !firstDay ? (hours ?? data)?.previous?.series : undefined
  const ghost = prevSeries?.map((p) => p[metric])
  const overlay = trail && trailData
    ? { values: trailData.current.series.slice(fv).map((p) => p[metric]), color: channelColor(trail), name: channelLabel(trail) }
    : undefined

  const narrow = useNarrow()
  const metricName = metric === 'visitors' ? 'Visitors' : 'Pageviews'
  // Replay's controls stay out while nothing is playing or picked.
  const active = playing || telling || scrubbing || (!!hours && hourAt !== null)
  const rows = full ? 12 : 5
  // The same words the date picker shows ("vs last year" for This year), so
  // the tiles, the chart legend and a shared card never disagree with it.
  const vs = 'vs ' + compareLabel(pickerValue.period, compareMode, pickerValue.range)
  const online = onlineNow(stream, data?.online, real?.online)

  // Hover must never change the Sources card's height (see its note below).
  let sourcesNote: string | undefined
  if (view.filters.some((f) => f.dim === 'channel')) sourcesNote = 'Filtered to one channel'
  else if (full) sourcesNote = trail ? 'Click to keep this channel' : 'Hover to follow the money'
  const pagesNote = trail ? `Where ${channelLabel(trail)} visitors landed` : 'Where visits start and what they read'
  const convOrBounce = money ? 'Conv.' : 'Bounce'
  // Following a channel, Sources keeps every channel, the followed one lit.
  const sourceRows = (dim: string): Row[] => {
    if (!perDay(dim)) return []
    return trailData && dim === 'channel' ? (cur?.dims.channel ?? []) : dims(dim)
  }

  // The mode is a property of the page, not of one card: everything from grid
  // density to card padding follows it.
  useEffect(() => {
    document.body.dataset.mode = full ? 'full' : 'core'
    return () => {
      delete document.body.dataset.mode
    }
  }, [full])

  return (
    <>
      {(firstLoad || loading) && <div className="loadbar" role="status" aria-label="Loading" />}
      <div className="header quiet">
        {header}
        <HeaderTools
          live={liveView}
          waiting={waiting}
          askOpen={askOpen}
          onAsk={() => setAskOpen(true)}
          onShare={() => setSharing(true)}
          extra={trail && trailData && (
            <button type="button" className="chip" style={{ borderColor: channelColor(trail) }} title={`Following ${channelLabel(trail)}: click to keep`} onClick={() => addFilter('channel', trail)}>
              <span className="dot" style={{ background: channelColor(trail) }} />
              <b>{channelLabel(trail)}</b>
            </button>
          )}
        />
        {!liveView && !waiting && <CreateMenu pages={dims('entry_page')} goals={src?.goals ?? []} modules={mods} onGoal={() => setAddGoals(true)} onNote={() => setNoteFor(view.day ?? today)} onFunnel={(f) => setView({ mode: 'full', funnel: f })} />}
      </div>

      {/* The second row: what the numbers are. Live/Data on the left, where
          it stays put; filters in force and saved views after it; the period
          on the right (Live drops only the period). Before the first visit
          there is nothing to switch or date, so the row waits too. */}
      {!waiting && <div className="subbar">
        {!isShared() && <ViewSwitch live={liveView} />}
        {!liveView && (view.filters.length > 0 || (!isShared() && segments.length > 0)) && (
          <Suspense fallback={null}>
            <FilterRow
              filters={view.filters}
              dimLabel={(dim) => DIM_LABEL[dim] ?? dim}
              valueLabel={filterLabel}
              onRemove={removeFilter}
              onClear={() => setView({ filters: [] })}
              onSave={saveView}
              views={isShared() ? undefined : { list: segments, current, onOpen: openView, onRename: renameView, onDelete: removeView }}
            />
          </Suspense>
        )}
        {!liveView && (
          <>
            {!isShared() && <FilterMenu rows={dims} labelFor={filterLabel} active={view.filters} onPick={addFilter} onRemove={removeFilter} onClear={() => setView({ filters: [] })} />}
            <DatePicker value={pickerValue} today={today} onChange={onPicker} short={narrow} tz={site.timezone}
              bucket={view.bucket} autoBucket={data?.bucket} onBucket={(b) => setView({ bucket: b })} />
            <MoreMenu
              full={full}
              onSettings={narrow && canChange() ? () => openSettings(site) : undefined}
              milestones={ms.on ? { open: ms.openList, dot: ms.dot } : undefined}
              onMode={(m) => setView({ mode: m })} onRefresh={reloadNow}
              onExport={() => downloadCsv(site.id, query)}
            />
          </>
        )}
      </div>}

      {liveView && (
        <LiveSlot key={site.id} site={site.id} timezone={site.timezone} cookieless={site.cookieless} stream={stream} onVisitor={journeysOn(site, mods !== null && shows(mods, 'cards', 'journey')) ? setJourney : undefined} />
      )}
      {!liveView && <>
      {sharing && <Suspense fallback={null}><ShareDialog site={site} sites={sites} onClose={() => setSharing(false)} /></Suspense>}
      {naming && (
        <Suspense fallback={null}>
        <SaveViewDialog
          filters={view.filters.length}
          onClose={() => setNaming(false)}
          onSave={(name) =>
            api
              .saveSegment(site.id, name, current)
              .then(() => {
                toast(`Saved "${name}"`)
                loadSegments()
                setNaming(false)
              })
              .catch((e: unknown) => toast(messageOf(e), 'error'))
          }
        />
        </Suspense>
      )}

      {error && (
        <div className="banner" role="alert">
          Couldn't load the report: {error}
        </div>
      )}

      {/* Never a silent wait: the store opens in the background on a restart,
          and nothing was lost while it does. */}
      {warming && (
        <div className="banner" role="status">
          <span className="spin" aria-hidden="true" />
          Warming up the analytics store — this happens once after a restart. Visits are still being recorded; the numbers appear in a moment.
        </div>
      )}

      {showInstall && <Suspense fallback={null}><Install site={site} visits={stream.visits} /></Suspense>}
      <MilestonesSlot ms={ms} site={site} quiet={showInstall} revenue={mods === null || shows(mods, 'cards', 'revenue')} />
      {!showInstall && !isShared() && siteState(site) === 'stopped' && <StoppedNotice site={site} />}

      {view.test && (
        <div className="banner" style={{ borderColor: 'var(--money)' }}>
          <span className="money-dot" />
          Showing <b style={{ color: 'var(--text)' }}>test payments</b> only (sandbox and test-mode purchases).
          <button type="button" className="btn ghost" style={{ height: 30, marginLeft: 'auto' }} onClick={() => setView({ test: false })}>
            Back to live revenue
          </button>
        </div>
      )}
      {money && money.unconverted > 0 && (
        <div className="banner">{unconvertedNote(money)}</div>
      )}

      <div className={waiting ? 'sleep view-stage waiting' : 'sleep view-stage'} aria-hidden={waiting || undefined} inert={waiting}>
      {/* One section for the period at a glance: the key numbers across the
          top, the chart under them — they are one story, not two cards. */}
      <section className="card overview" aria-label="Overview">
      <div role="group" aria-label="Key numbers" className={money ? 'kpis money' : 'kpis'}>
        <KpiTile loading={firstLoad} vs={vs} label="Visitors" icon={Users} spark={chartSeries.map((p) => p.visitors)} value={k?.visitors} live={follow((r) => r.kpis.visitors)} fmt={fmtInt} d={delta(k?.visitors ?? 0, pk?.visitors)} pressed={metric === 'visitors'} onClick={() => setMetric('visitors')} />
        {money ? (
          <>
            <KpiTile loading={firstLoad} vs={vs} label="Revenue" icon={Banknote} spark={sparkOf((d) => d.money?.revenue ?? 0)} money value={revenueNow} live={follow((r) => r.revenue)} fmt={fmtM} d={pm ? delta(money.revenue, pm.revenue) : null} />
            <KpiTile loading={firstLoad} vs={vs} label="Conversion" icon={Target} spark={sparkOf((d) => (d.kpis.visitors ? (d.money?.payments ?? 0) / d.kpis.visitors : 0))} value={conv} fmt={(x) => (x * 100).toFixed(x < 0.1 ? 2 : 1) + '%'} d={pm && conv !== undefined ? delta(conv, pm.conversion) : null} />
            <KpiTile loading={firstLoad} vs={vs} label="Per visitor" icon={Coins} spark={sparkOf((d) => (d.kpis.visitors ? (d.money?.revenue ?? 0) / d.kpis.visitors : 0))} value={rpv} live={follow((r) => (r.kpis.visitors ? r.revenue / r.kpis.visitors : 0))} fmt={(x) => fmtMoney(x, money.currency, money.exponent, { cents: true })} d={pm && rpv !== undefined ? delta(rpv, pm.revenue_per_visitor) : null} />
          </>
        ) : (
          <KpiTile loading={firstLoad} vs={vs} label="Pageviews" icon={Eye} spark={chartSeries.map((p) => p.pageviews)} value={k?.pageviews} live={follow((r) => r.kpis.pageviews)} fmt={fmtInt} d={delta(k?.pageviews ?? 0, pk?.pageviews)} pressed={metric === 'pageviews'} onClick={() => setMetric('pageviews')} />
        )}
        <KpiTile loading={firstLoad} vs={vs} label="Bounce rate" icon={CornerUpLeft} spark={sparkOf((d) => d.kpis.bounce_rate)} value={k?.bounce_rate} live={follow((r) => r.kpis.bounce_rate)} fmt={fmtPct} d={delta(k?.bounce_rate ?? 0, pk?.bounce_rate, true)} />
        <KpiTile loading={firstLoad} vs={vs} label="Session time" icon={Timer} spark={sparkOf((d) => d.kpis.avg_session_s)} value={k?.avg_session_s} live={follow((r) => r.kpis.avg_session_s)} fmt={fmtDuration} d={delta(k?.avg_session_s ?? 0, pk?.avg_session_s)} />
        {/* A shared page has no live stream, so it says where the number
            comes from instead of waiting to connect forever. */}
        <OnlineKpi online={online} canOpen={!isShared()} note={stream.connected || isShared() ? entryCopy.onlineNote : entryCopy.connecting} />
      </div>

      {full && (
        <div className="more-numbers rise">
          <button type="button" className="more-toggle" aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)}>
            <ChevronRight size={15} strokeWidth={1.75} aria-hidden="true" />
            More numbers
            {!moreOpen && k && (
              <span className="faint num">
                {fmtInt(k.sessions)} sessions{newShareShort(k, site)}{money && !scrubbing ? ` · ${fmtInt(money.customers)} customers` : ''}
              </span>
            )}
          </button>
          {moreOpen && (
            <div className="more-grid">
              <Num label="Sessions" value={k ? fmtInt(k.sessions) : '–'} />
              <Num label="Views / session" value={k ? k.views_per_session.toFixed(2) : '–'} />
              <Num label="New visitors" value={newShare(k, site)} />
              <Num label="Sessions / visitor" value={k && k.visitors ? (k.sessions / k.visitors).toFixed(2) : '–'} />
              <Num label="Pageviews" value={k ? fmtInt(k.pageviews) : '–'} />
              {money && !scrubbing && (
                <>
                  <Num label="Customers" value={fmtInt(money.customers)} />
                  <Num label="Avg. order" value={money.payments ? fmtM(Math.round((money.revenue + money.refunds) / money.payments)) : '–'} />
                  <Num label="Refunds" value={fmtM(money.refunds)} />
                </>
              )}
            </div>
          )}
        </div>
      )}

      <div className={active ? 'overview-chart replaying' : 'overview-chart'} role="group" aria-label={`${metricName} over time`}>
        <ChartHead title={metricName} since={firstDay && fmtDay(firstDay)} onShowSince={firstDay ? () => setView({ period: 'custom', from: firstDay, to: range.to, day: undefined }) : undefined}>
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
        {firstLoad || (byHour && !hours) || (firstVisit > 0 && !notesReady) ? (
          <Loading height={narrow ? 170 : 220} />
        ) : (
          <TimeChart
            height={narrow ? 170 : 220}
            labels={chartSeries.map((p) => p.t)}
            values={values}
            ghost={ghost}
            ghostLabels={prevSeries?.map((p) => p.t)}
            overlay={hours ? undefined : overlay}
            metric={metricName}
            bucket={hours ? 'hour' : (data?.bucket ?? 'day')}
            scrub={chartScrub}
            story={telling}
            locked={playing}
            partialLast={live}
            strip={money && src && !hours ? { values: src.series.slice(fv).map((p) => p.revenue ?? 0), fmt: fmtM, label: 'Revenue' } : undefined}
            notes={notesOn ? notes : []}
            onAddNote={isShared() || isViewer() || !notesOn ? undefined : (day) => setNoteFor(day)}
            pulses={pulses}
            detail={(i) => {
              // The day's own numbers, when the report carried them — only
              // while the chart is by day: by week, point i is not day i.
              if (hours) return hourDetail(chartSeries[i], site)
              if (data?.bucket !== 'day') return null
              const d = cur?.days?.find((x) => x.date === chartSeries[i]?.t.slice(0, 10)) // days skip empty ones: match by date
              if (!d) return null
              const nvr = newVsReturning(d.kpis, site)
              const rows: { label: string; value: string; faint?: boolean }[] = [{ label: 'Pageviews', value: fmtInt(d.kpis.pageviews) }, ...nvr.rows]
              // Revenue itself is already in the card, next to the bars.
              if (money && d.money) {
                rows.push({ label: 'Revenue / visitor', value: fmtMoney(d.kpis.visitors ? d.money.revenue / d.kpis.visitors : 0, money.currency, money.exponent, { cents: true }) })
              }
              rows.push({ label: 'Bounce rate', value: fmtPct(d.kpis.bounce_rate), faint: true })
              rows.push({ label: 'Session time', value: fmtDuration(d.kpis.avg_session_s), faint: true })
              const splits = nvr.splits
              // Where the day's money came from: a flat day can be all renewals.
              if (money && d.money && d.money.revenue > 0)
                splits.push({ a: d.money.new, b: d.money.renewal, aLabel: 'new', bLabel: 'renewals', tone: 'var(--money)', fmt: fmtM })
              return { splits, rows }
            }}
            onScrub={
              canScrub && full && !hours
                ? (i) => {
                    setPlaying(false)
                    setDayIdx(i + fv)
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
            at={scrubIdx}
            day={scrubbing && view.day ? fmtDay(view.day, { weekday: true }) : undefined}
            onScrub={(i) => {
              setPlaying(false)
              setDayIdx(i)
            }}
            onBack={() => {
              setStory('off')
              setPlaying(false)
              setHourAt(null)
              setDayIdx(null)
            }}
          />
        )}
        {!showInstall && !isShared() && notesOn && (full || notes.length > 0) && (
          <NoteBar count={notes.length} onAdd={isViewer() ? undefined : () => setNoteFor(view.day ?? today)} onOpen={() => setNotesOpen(true)} />
        )}
      </div>
      </section>

      {notesOpen && notesOn && (
        <Suspense fallback={null}>
          <NotesDialog site={site} onJump={showDay} onChanged={loadNotes} onClose={() => setNotesOpen(false)} />
        </Suspense>
      )}
      {noteFor && notesOn && (
        <Suspense fallback={null}>
        <NoteDialog
          site={site}
          day={noteFor}
          today={today}
          // The strip only makes sense by day; an hourly view gets the
          // calendar alone.
          days={data?.bucket === 'day' ? series.map((pt) => ({ day: pt.t.slice(0, 10), visitors: pt.visitors })) : []}
          notes={notes}
          onClose={() => setNoteFor(null)}
          onSaved={loadNotes}
        />
        </Suspense>
      )}

      {full && hasData && <JumpNav grid={chartsOnly} />}

      {/* Full is one grid: the charts, then goals, revenue and the modules as
          cards in it. The charts need the signed-in API, so a shared link
          keeps the breakdowns instead. */}
      <FullGrid on={chartsOnly}>
      {chartsOnly && (
        <Suspense fallback={<div data-w={4}><Loading height={240} /></div>}>
          <FullCharts
            site={site}
            query={query}
            bucket={data?.bucket ?? 'day'}
            modules={mods}
            money={scrubbing ? undefined : money}
            countryRevenue={src?.revenue_dims?.country ?? []}
            fmtMoney={fmtM}
            onPickCountry={(c) => addFilter('country', c)}
          />
        </Suspense>
      )}

      {!chartsOnly && <section aria-label="Breakdowns" className="grid4" id="sec-sources">
        <TabbedCard
          title="Sources"
          // Hover must never change this card's height. A line that appeared
          // only while hovering pushed the rows down under the cursor, which
          // moved the hover to another row, which removed the line: a flicker
          // loop. Core has no line in any state; Full always has one.
          note={sourcesNote}
          tabs={[
            { dim: 'channel', label: 'Channels' },
            { dim: 'referrer', label: 'Referrers' },
            { dim: 'campaign', label: 'Campaigns' },
            // Google's own numbers, once Search Console is connected. A share
            // link cannot reach them, so it never shows the tab.
            ...(mods !== null && shows(mods, 'tabs', 'search') && !isShared() ? [{ dim: 'search', label: 'Search' }] : []),
          ]}
          render={(dim) => dim === 'search' ? (
            <SearchTerms site={site} query={query} rows={rows} full={full} />
          ) : (
            <BarList
              dimLabel={DIM_LABEL[dim]}
              valueLabel={soFar}
              loading={firstLoad}
              subLabel={full && !scrubbing ? convOrBounce : undefined}
              onPick={(v) => addFilter(dim, v)}
              onHover={dim === 'channel' ? onSourceHover : undefined}
              money={full && money && !scrubbing ? fmtM : undefined}
              emptyText={!perDay(dim) ? 'Per-day data covers channels only' : undefined}
              items={sourceRows(dim)
                .slice(0, rows)
                .map((r) => ({
                  key: r.value,
                  label: dim === 'channel' ? channelLabel(r.value) : r.value || '(none)',
                  title: r.value,
                  value: r.visitors,
                  sub: full && money && !scrubbing ? convOf(r) : r.bounce_rate,
                  rev: r.revenue,
                  color: dim === 'channel' ? channelColor(r.value) : undefined,
                  dim: !!trail && dim === 'channel' && r.value !== trail,
                }))}
            />
          )}
        />
        <TabbedCard
          title="Pages"
          note={full ? pagesNote : undefined}
          tabs={[
            { dim: 'entry_page', label: 'Entry' },
            { dim: 'page', label: 'Top' },
            ...(full ? [{ dim: 'exit_page', label: 'Exit' }] : []),
            // Sections only exist once the site defines them, so the tab
            // appears with the first rule and not before.
            ...(full && (cur?.dims.group?.length ?? 0) > 0 ? [{ dim: 'group', label: 'Sections' }] : []),
            // How far down people read. Full only, and not on share links,
            // which only reach the main report.
            ...(full && !isShared() ? [{ dim: 'scroll', label: 'Scroll' }] : []),
          ]}
          render={(dim) => dim === 'scroll' ? (
            <Suspense fallback={null}><ScrollDepth site={site} query={query} rows={rows} /></Suspense>
          ) : (
            <BarList
              dimLabel={DIM_LABEL[dim]}
              valueLabel={soFar}
              loading={firstLoad}
              subLabel={full && dim !== 'page' && !money && !scrubbing ? 'Bounce' : undefined}
              onPick={(v) => addFilter(dim, v)}
              barColor={trail ? channelColor(trail) : undefined}
              emptyText={!perDay(dim) ? 'Per-day data covers entry pages only' : undefined}
              // A sale belongs to a visit, and a visit has one entry page but
              // many pages and sections. Showing a money column of dashes there
              // would read as missing data; there is nothing to attribute.
              money={full && money && !scrubbing && dim !== 'page' && dim !== 'group' ? fmtM : undefined}
              items={(perDay(dim) ? dims(dim) : []).slice(0, rows).map((r) => ({ key: r.value, label: r.value || '/', title: r.value, value: r.visitors, sub: r.bounce_rate, rev: r.revenue }))}
            />
          )}
        />
        <TabbedCard
          title="Locations"
          // Countries first, so the 27 KB map is downloaded by the people who
          // ask for it. Regions and cities have always been recorded and
          // filterable; until now nothing ever showed them.
          tabs={[
            { dim: 'country', label: 'Countries' },
            ...(full ? [{ dim: 'region', label: 'Regions' }, { dim: 'city', label: 'Cities' }] : []),
            ...(mapOn ? [{ dim: 'map', label: 'Map' }] : []),
          ]}
          render={(dim) =>
            dim === 'map' ? (
              <Suspense fallback={<Loading height={180} />}>
                <WorldMap rows={dims('country')} onPick={(c) => addFilter('country', c)} />
              </Suspense>
            ) : (
              <BarList
                dimLabel={PLACE_LABEL[dim] ?? 'City'}
                valueLabel={soFar}
                loading={firstLoad}
                subLabel={full && !money && !scrubbing ? 'Bounce' : undefined}
                onPick={(v) => addFilter(dim, v)}
                barColor={trail ? channelColor(trail) : undefined}
                items={dims(dim)
                  .slice(0, rows)
                  .map((r) => ({
                    key: r.value,
                    label: dim === 'country' ? `${flag(r.value)} ${countryName(r.value)}` : r.value || 'Unknown',
                    title: dim === 'country' ? countryName(r.value) : r.value,
                    value: r.visitors,
                    sub: r.bounce_rate,
                    rev: r.revenue,
                  }))}
                money={full && money && !scrubbing ? fmtM : undefined}
              />
            )
          }
        />
        <TabbedCard
          title="Devices"
          tabs={[
            { dim: 'device', label: 'Device' },
            { dim: 'browser', label: 'Browser' },
            { dim: 'os', label: 'OS' },
          ]}
          render={(dim) => (
            <BarList
              dimLabel={DIM_LABEL[dim]}
              valueLabel={soFar}
              loading={firstLoad}
              subLabel={full && !money && !scrubbing ? 'Bounce' : undefined}
              onPick={(v) => addFilter(dim, v)}
              barColor={trail ? channelColor(trail) : undefined}
              emptyText={!perDay(dim) ? 'Per-day data covers device type only' : undefined}
              money={full && money && !scrubbing ? fmtM : undefined}
              items={(perDay(dim) ? dims(dim) : []).slice(0, rows).map((r) => ({ key: r.value, label: r.value || 'Unknown', value: r.visitors, sub: r.bounce_rate, rev: r.revenue }))}
            />
          )}
        />
      </section>}

      {full && (
        <section aria-label="Goals and revenue" className="grid2 rise" id="sec-goals" data-group>
          {/* Off means off: with Goals off the script records none, so the card
              would only ask for something that cannot arrive. */}
          {shows(mods, 'cards', 'goals') && (
          <div className="card">
            <div className="card-head">
              <h2>Goals</h2>
              <button type="button" className="btn ghost" style={{ marginLeft: 'auto', height: 30, fontSize: 12.5 }} onClick={() => setAddGoals(true)}>
                + Track a goal
              </button>
            </div>
            <BarList
              dimLabel="Goal"
              subLabel="Conv."
              loading={firstLoad}
              barColor="var(--accent)"
              emptyText="No goals yet. Track one with trckable('signup')."
              onPick={(v) => addFilter('goal', v)}
              items={((scrubbing ? null : src?.goals) ?? []).slice(0, rows).map(
                (r): BarItem => ({ key: r.value, label: <span className="num">{r.value}</span>, title: r.value, value: r.visitors, sub: k?.visitors ? r.visitors / k.visitors : 0 }),
              )}
            />
          </div>
          )}
          {money ? (
            <TabbedCard
              title="Top earners"
              note={
                view.attr === 'first'
                  ? 'Revenue by the visit that found them — the first one in the 90 days before the sale'
                  : 'Revenue by the visit that closed it — the last one before the sale'
              }
              extra={
                <div className="seg small" role="group" aria-label="Which visit gets the credit" style={{ marginLeft: 'auto' }}>
                  <button type="button" aria-pressed={view.attr !== 'first'} onClick={() => setView({ attr: undefined })}>
                    Closed it
                  </button>
                  <button type="button" aria-pressed={view.attr === 'first'} onClick={() => setView({ attr: 'first' })}>
                    Found them
                  </button>
                </div>
              }
              tabs={[
                { dim: 'channel', label: 'Channel' },
                { dim: 'referrer', label: 'Referrer' },
                { dim: 'campaign', label: 'Campaign' },
                { dim: 'entry_page', label: 'Page' },
              ]}
              render={(dim) => (
                <BarList
                  dimLabel={DIM_LABEL[dim]}
                  valueLabel="Customers"
                  loading={firstLoad}
                  byRevenue
                  money={fmtM}
                  barColor="var(--money)"
                  emptyText={scrubbing ? 'Whole-period view only' : 'No attributed revenue yet. Pass trckable_vid to your checkout (Settings → Payments).'}
                  onPick={(v) => addFilter(dim, v)}
                  items={(scrubbing ? [] : (src?.revenue_dims?.[dim] ?? [])).slice(0, rows).map((r) => ({
                    key: r.value,
                    label: dim === 'channel' ? channelLabel(r.value) : r.value || '(none)',
                    title: r.value,
                    value: r.customers ?? 0,
                    rev: r.revenue,
                    color: dim === 'channel' ? channelColor(r.value) : undefined,
                  }))}
                />
              )}
            />
          ) : null}
        </section>
      )}

      {full && hasData && <Behaviour site={site} query={query} mods={mods} pages={dims('entry_page')} goals={src?.goals ?? []} steps={view.funnel ?? []} onSteps={(f) => setView({ funnel: f })} onPick={setJourney} />}
      </FullGrid>

      {!full && hasData && (
        <section className="banner" style={{ justifyContent: 'space-between', flexWrap: 'wrap', padding: '20px 24px', borderRadius: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <strong style={{ color: 'var(--text)' }}>That's the whole story on one screen.</strong>
            <span>Full mode adds more numbers, bounce on every row, exit pages, goals, campaigns and the live feed. Nothing reloads.</span>
          </div>
          <button type="button" className="btn primary" onClick={() => setView({ mode: 'full' })}>
            Show Full <span className="kbd" style={{ color: 'inherit', borderColor: 'currentColor' }}>{caps(keyFor('mode')).join('')}</span>
          </button>
        </section>
      )}

      {cur?.approximate && (
        <p className="faint" style={{ fontSize: 12, margin: 0 }}>
          Breakdown visitor counts are estimates (±2%) for ranges above 250,000 sessions. Totals are exact.
        </p>
      )}

      </div>
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

      <AskPanel open={askOn && askOpen} onClose={() => setAskOpen(false)} />
    </>
  )
}

/**
 * A card's hint. Wide screens read it beside the title; phones hide that line
 * (see .card-note) and show this (i) instead, which reveals the same words
 * when tapped. Nothing is lost, but the cards stay short.
 */
function InfoDot({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="info-dot" aria-label={text} title={text} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        i
      </button>
      {open && (
        <span className="faint note-open" style={{ fontSize: 12 }}>
          {text}
        </span>
      )}
    </>
  )
}

/** Whether a media query matches, kept up to date. */
function useMedia(query: string) {
  const [on, setOn] = useState(() => typeof matchMedia === 'function' && matchMedia(query).matches)
  useEffect(() => {
    const mq = matchMedia(query)
    const change = () => setOn(mq.matches)
    mq.addEventListener('change', change)
    return () => mq.removeEventListener('change', change)
  }, [query])
  return on
}

/** True on phone-width screens, so the chart and cards can shrink. */
const useNarrow = () => useMedia('(max-width: 640px)')

const zeroKPIs: KPIs = { visitors: 0, sessions: 0, pageviews: 0, bounce_rate: 0, avg_session_s: 0, views_per_session: 0, new_visitor_share: 0 }

/** One label and one number, in the folded "More numbers" grid. */
function Num({ label, value }: { label: string; value: string }) {
  return (
    <div className="num-cell">
      <span className="faint">{label}</span>
      <b className="num">{value}</b>
    </div>
  )
}

function TabbedCard(p: { title: string; note?: string; extra?: React.ReactNode; tabs: { dim: string; label: string }[]; render: (dim: string) => React.ReactNode }) {
  const [tab, setTab] = useState(p.tabs[0].dim)
  // A card you never read can be folded away, and it stays folded.
  const key = 'trckable:fold:' + p.title
  const [folded, setFolded] = useState(() => {
    try {
      return localStorage.getItem(key) === '1'
    } catch {
      return false
    }
  })
  const fold = (v: boolean) => {
    setFolded(v)
    try {
      localStorage.setItem(key, v ? '1' : '0')
    } catch {
      /* private mode */
    }
  }
  const active = p.tabs.some((t) => t.dim === tab) ? tab : p.tabs[0].dim
  return (
    <div className={folded ? 'card folded' : 'card'}>
      <div className="card-head" style={{ flexWrap: 'wrap' }}>
        <button type="button" className="fold" aria-expanded={!folded} aria-label={folded ? `Show ${p.title}` : `Hide ${p.title}`} onClick={() => fold(!folded)}>
          <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <h2 style={{ whiteSpace: 'nowrap' }}>{p.title}</h2>
        {p.tabs.length > 1 ? (
          <div className="tabs" role="tablist" aria-label={`${p.title} breakdown`}>
            {p.tabs.map((t) => (
              <button key={t.dim} type="button" role="tab" aria-selected={active === t.dim} onClick={() => setTab(t.dim)}>
                {t.label}
              </button>
            ))}
          </div>
        ) : (
          p.note && (
            <span className="faint card-note" style={{ fontSize: 12 }}>
              {p.note}
            </span>
          )
        )}
        {p.note && <InfoDot text={p.note} />}
        {p.extra}
      </div>
      {p.tabs.length > 1 && p.note && (
        <span className="faint card-note" style={{ fontSize: 12, marginTop: -6 }}>
          {p.note}
        </span>
      )}
      {!folded && <div role="tabpanel">{p.render(active)}</div>}
    </div>
  )
}
