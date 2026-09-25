import { Banknote, ChevronDown, ChevronRight, CircleUser, Coins, CornerUpLeft, Download, Ellipsis, Eye, Keyboard, KeyRound, Maximize2, MessageCircle, Minimize2, Pause, Play, Radio, RefreshCw, Target, Timer, Users, type LucideIcon } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DialogActions } from '../components/DialogActions'
import { Modal } from '../components/Modal'
import { BarList, type BarItem } from '../charts/BarList'
import { TimeChart, type Pulse } from '../charts/TimeChart'
import { DatePicker, type PickerValue } from '../components/DatePicker'
import { api, cachedReport, dropReports, exportURL, type Annotation, type Filter, type Segment as SavedView, type KPIs, type ReportQuery, type Row, type Site } from '../lib/api'
import { calendarPrevious, diffDays, fmtDay, presetById, setWeekStart, todayIn, type Range } from '../lib/dates'
import { countryName, delta, flag, fmtDuration, fmtInt, fmtMoney, fmtPct, type Delta } from '../lib/format'
import { useTween } from '../lib/motion'
import { channelColor, channelLabel } from '../lib/palette'
import { navigate, readView, setView, useLocation } from '../lib/url'
import { openAccount } from '../lib/account'
import { openShortcuts } from '../components/ShortcutsHost'
import { isShared, sharedModules } from '../lib/me'
import { THEMES, useTheme } from '../lib/theme'
import { ModeToggle } from '../components/ModeToggle'
import { FilterMenu } from '../components/FilterMenu'
import { toast } from '../components/Toast'
import { useLive } from '../lib/useLive'
import { useReport } from '../lib/useReport'
import { sampleReport } from '../lib/sample'
import { AskPanel } from './AskPanel'
import { Install } from './InstallPanel'
import { caps, keyFor, pressed, useKeymap } from '../lib/keys'
import { ActiveFilters } from '../components/ActiveFilters'
import { SavedViews } from '../components/SavedViews'
import { SpeedMenu } from '../components/SpeedMenu'
import { LiveFeed } from './LiveFeed'
import { SearchTerms } from './SearchTerms'
import { ScrollDepth } from './ScrollDepth'

// Full mode's extra views live in their own chunk: Core never loads them.
const Rhythm = lazy(() => import('./FullModules').then((m) => ({ default: m.Rhythm })))
const Funnel = lazy(() => import('./FullModules').then((m) => ({ default: m.Funnel })))
const WorldMap = lazy(() => import('./WorldMap').then((m) => ({ default: m.WorldMap })))
const Crawlers = lazy(() => import('./Crawlers').then((m) => ({ default: m.Crawlers })))
const Vitals = lazy(() => import('./Vitals').then((m) => ({ default: m.Vitals })))
const Retention = lazy(() => import('./Retention').then((m) => ({ default: m.Retention })))
const AddGoals = lazy(() => import('./AddGoals').then((m) => ({ default: m.AddGoals })))
const People = lazy(() => import('./FullModules').then((m) => ({ default: m.People })))
const NoteDialog = lazy(() => import('../components/NoteDialog').then((m) => ({ default: m.NoteDialog })))
const JourneyDrawer = lazy(() => import('./FullModules').then((m) => ({ default: m.JourneyDrawer })))

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

export function Dashboard({ site, sites, header }: { site: Site; sites: Site[]; header: React.ReactNode }) {
  // Before anything reads a date: "This week" starts on the site's own day.
  setWeekStart(site.week_start)
  useKeymap()
  const { params } = useLocation()
  const view = readView(params)
  const today = todayIn(site.timezone)
  const range: Range = useMemo(() => {
    if (view.period === 'custom' && view.from && view.to) return { from: view.from, to: view.to > today ? today : view.to }
    return (presetById(view.period) ?? presetById('30d')!).range(today)
  }, [view.period, view.from, view.to, today])
  const full = view.mode === 'full'

  // A calendar period is compared with the same stretch of the one before
  // (lib/dates.ts), which the server takes as a custom comparison.
  const calPrev = view.compare === 'previous' ? calendarPrevious(view.period, range) : null
  const query: ReportQuery = useMemo(
    () => ({
      from: range.from,
      to: range.to,
      compare: view.compare === 'none' ? undefined : calPrev ? 'custom' : view.compare,
      cfrom: calPrev ? calPrev.from : view.cfrom,
      cto: calPrev ? calPrev.to : view.cto,
      filters: view.filters,
      daily: diffDays(range.from, range.to) >= 1 && diffDays(range.from, range.to) < 400,
      testPayments: view.test,
      bucket: view.bucket,
      attr: view.attr,
      deep: full,
    }),
    [range.from, range.to, view.compare, view.cfrom, view.cto, calPrev?.from, JSON.stringify(view.filters), view.test, view.bucket, view.attr, full], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const live = range.to === today
  const { data: real, error, warming, loading, refresh } = useReport(site.id, query, { live })
  // A shared link has no session, so no live stream: the report refreshes on
  // its own timer instead.
  const stream = useLive(isShared() ? '' : site.id)

  // ---- a site with nothing in it yet ----
  // Until the first visit arrives we show a sample dashboard, lightly out of
  // focus, so the empty state looks like what it is about to become. The live
  // stream wakes it the moment a real visit lands.
  const firstLoad = !real && !error
  const curReal = real?.current
  const hasData = !!curReal && (curReal.kpis.sessions > 0 || (real?.previous?.kpis.sessions ?? 0) > 0)
  const mayBeNew = !firstLoad && !hasData && view.filters.length === 0
  const [everTracked, setEverTracked] = useState<boolean | null>(null)
  useEffect(() => {
    if (!mayBeNew || everTracked !== null) return
    if (isShared()) return setEverTracked(true) // a shared link is only made for a site that already works
    api
      .events(site.id, 1)
      .then((r) => setEverTracked(r.events.length > 0))
      .catch(() => setEverTracked(true)) // on error, assume installed: never fake a working dashboard
  }, [mayBeNew, everTracked, site.id])
  const showInstall = mayBeNew && everTracked === false
  const waiting = showInstall && stream.visits.length === 0
  const [mods, setMods] = useState<Record<string, boolean> | null>(() => (isShared() ? sharedModules() : null))
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
  // Notes on the chart: why that spike happened, kept with the numbers.
  const [notes, setNotes] = useState<Annotation[]>([])
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
  const saveView = () => setNaming(true)
  const current = location.search.replace(/^\?/, '')
  const openView = (g: SavedView) => navigate(location.pathname + '?' + g.query)
  const removeView = (g: SavedView) =>
    api
      .deleteSegment(site.id, g.id)
      .then(() => (toast(`Deleted "${g.name}"`), loadSegments()))
      .catch((e: Error) => toast(e.message, 'error'))
  const renameView = (g: SavedView, name: string) =>
    api
      .renameSegment(site.id, g.id, name)
      .then(() => (toast(`Renamed to "${name}"`), loadSegments()))
      .catch((e: Error) => {
        toast(e.message, 'error')
        throw e
      })
  const loadNotes = useCallback(() => {
    api
      .annotations(site.id, range.from, range.to)
      .then((r) => setNotes(r.annotations ?? []))
      .catch(() => setNotes([]))
  }, [site.id, range.from, range.to])
  useEffect(() => {
    loadNotes()
  }, [loadNotes])
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
  const mapOn = !!mods?.map
  // The Ask button follows its module: off means the entry point is gone too.
  const askOn = !isShared() && (mods === null || mods.ask !== false)
  const sample = useMemo(() => sampleReport(site.id, site.timezone, range.from, range.to), [site.id, site.timezone, range.from, range.to])
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
  useEffect(() => setTrail(null), [query])
  const trailData = trail && trailReport.data && trailReport.data.from === data?.from ? trailReport.data : null

  // ---- scrubber / replay ----
  const cur = data?.current
  const canScrub = !!data && data.bucket === 'day' && (cur?.series.length ?? 0) > 1
  // Replay steps a day at a time. A chart by week or month still offers it:
  // pressing Replay switches to days, and it starts once they have arrived.
  const canReplayByDay = !!data && !canScrub && data.bucket !== 'hour' && diffDays(range.from, range.to) >= 1 && diffDays(range.from, range.to) < 400
  const [replaySoon, setReplaySoon] = useState(false)
  const scrubIdx = canScrub && view.day ? cur!.series.findIndex((p) => p.t.startsWith(view.day!)) : -1
  const scrubbing = scrubIdx >= 0

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
      .forEach((v, i) => setTimeout(() => addPulse({ id: 'v' + v.id, kind: v.kind === 'goal' ? 'goal' : 'visit' }), i * 140))
  }, [stream.visits, pulsing, addPulse])
  useEffect(() => {
    const fresh = stream.sales.filter((x) => x.id > lastSale.current)
    if (!fresh.length) return
    lastSale.current = fresh[0].id
    if (!pulsing) return
    fresh
      .slice(0, 4)
      .reverse()
      .forEach((x, i) => setTimeout(() => addPulse({ id: 's' + x.id, kind: 'sale', label: '+' + fmtMoney(x.amount, x.currency, x.exponent) }), i * 400))
  }, [stream.sales, pulsing, addPulse])
  const [playing, setPlaying] = useState(false)
  // How fast a replay runs, remembered in this browser (a convenience, so a
  // private window simply starts at 1×).
  const [speed, setSpeed] = useState(() => {
    try {
      return Number(localStorage.getItem('tkb_replay_speed')) || 1
    } catch {
      return 1
    }
  })
  const pickSpeed = (n: number) => {
    setSpeed(n)
    try {
      localStorage.setItem('tkb_replay_speed', String(n))
    } catch {
      /* storage blocked: the choice lasts until the page closes */
    }
  }
  const setDayIdx = useCallback(
    (i: number | null) => {
      if (!cur) return
      setView({ day: i == null ? undefined : cur.series[i]?.t.slice(0, 10) })
    },
    [cur],
  )
  // A replay is a race to the period's totals, so it finishes on them: the
  // standings after the last day are the whole period.
  useEffect(() => {
    if (!playing || !cur) return
    const n = cur.series.length
    const every = (n > 60 ? 90 : n > 20 ? 200 : 480) / speed
    let i = scrubIdx < 0 || scrubIdx >= n - 1 ? 0 : scrubIdx
    setDayIdx(i)
    const t = setInterval(() => {
      i++
      if (i >= n) {
        clearInterval(t)
        setPlaying(false)
        setDayIdx(null)
        return
      }
      setDayIdx(i)
    }, every)
    return () => clearInterval(t)
    // A new speed picks up from the day on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed])

  useEffect(() => {
    if (replaySoon && canScrub) {
      setReplaySoon(false)
      setPlaying(true)
    }
  }, [replaySoon, canScrub])

  const [askOpen, setAskOpen] = useState(false)

  // ---- keyboard: ⌘K opens Ask, F toggles Core/Full, Esc clears scrub ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (pressed(e, 'ask')) {
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
  }, [full, view.day])

  const [metric, setMetric] = useState<'visitors' | 'pageviews'>('visitors')

  const pickerValue: PickerValue = {
    period: view.period,
    range,
    compare: view.compare,
    compareCustom: view.cfrom && view.cto ? { from: view.cfrom, to: view.cto } : undefined,
  }
  const onPicker = (v: PickerValue) => {
    setPlaying(false)
    const preset = v.period !== 'custom'
    setView({
      period: v.period,
      from: preset ? undefined : v.range.from,
      to: preset ? undefined : v.range.to,
      compare: v.compare,
      cfrom: v.compare === 'custom' ? v.compareCustom?.from : undefined,
      cto: v.compare === 'custom' ? v.compareCustom?.to : undefined,
      day: undefined,
      // "Now" is the live view: today, by the hour. That hour is Now's, not
      // a choice the person made, so leaving Now leaves it behind — a month
      // drawn in 700 hourly points is not what anybody asked for.
      bucket: v.period === 'now' ? 'hour' : view.period === 'now' ? undefined : view.bucket,
    })
  }

  const addFilter = (dim: string, value: string) => {
    setTrail(null)
    const rest = view.filters.filter((f) => f.dim !== dim)
    setView({ filters: [...rest, { dim, value }], day: undefined })
  }
  const removeFilter = (f: Filter) => setView({ filters: view.filters.filter((x) => x !== f && !(x.dim === f.dim && x.value === f.value)) })

  // ---- what the numbers show right now: whole period, scrubbed day, or trail ----
  const src = trailData?.current ?? cur
  const day = scrubbing ? src?.days?.find((d) => d.date === view.day) : undefined
  // While replay plays, the page races: the cards and lists count every day
  // up to the one playing, so numbers climb and rows overtake each other as
  // the period unfolds. Paused on a day, they show that day alone, as a
  // scrubbed day always has.
  const racing = playing && scrubbing
  const raceTo = racing ? scrubIdx : -1
  const raceK = useMemo(() => {
    const days = src?.days
    if (raceTo < 0 || !days) return null
    let visitors = 0, sessions = 0, pageviews = 0, bounced = 0, secs = 0, fresh = 0, revenue = 0
    for (const d of days.slice(0, raceTo + 1)) {
      const x = d.kpis
      visitors += x.visitors
      sessions += x.sessions
      pageviews += x.pageviews
      bounced += x.bounce_rate * x.sessions
      secs += x.avg_session_s * x.sessions
      fresh += x.new_visitor_share * x.visitors
      revenue += d.money?.revenue ?? 0
    }
    // Someone who came on two days is two daily visitors but one visitor of
    // the period, so the days add up to more than the period. Scaled by that
    // ratio, the count climbs to the period's own figure and stops there,
    // instead of overshooting and dropping back when the replay ends.
    const allVisitors = days.reduce((a, d) => a + d.kpis.visitors, 0)
    if (allVisitors && src?.kpis) visitors *= src.kpis.visitors / allVisitors
    const kpis: KPIs = {
      visitors, sessions, pageviews,
      bounce_rate: sessions ? bounced / sessions : 0,
      avg_session_s: sessions ? secs / sessions : 0,
      views_per_session: sessions ? pageviews / sessions : 0,
      new_visitor_share: visitors ? fresh / visitors : 0,
    }
    return { kpis, revenue }
  }, [src, raceTo])
  const k: KPIs | undefined = raceK ? raceK.kpis : scrubbing ? (day?.kpis ?? zeroKPIs) : src?.kpis
  const pk = !scrubbing && !trailData ? data?.previous?.kpis : undefined
  const race = useMemo(() => {
    const out: Record<string, Row[]> = {}
    const days = src?.days
    if (raceTo < 0 || !days) return out
    for (const dim of ['channel', 'entry_page', 'country', 'device']) {
      // Days keep visitors only; a bounce rate would have to be invented.
      const sum = new Map<string, number>()
      const all = new Map<string, number>()
      days.forEach((d, i) => {
        for (const r of d.dims?.[dim] ?? []) {
          all.set(r.value, (all.get(r.value) ?? 0) + r.visitors)
          if (i <= raceTo) sum.set(r.value, (sum.get(r.value) ?? 0) + r.visitors)
        }
      })
      // Each row lands on its own period figure, as the cards do.
      const period = new Map((src?.dims?.[dim] ?? []).map((r) => [r.value, r.visitors]))
      out[dim] = [...sum]
        .map(([value, n]) => {
          const whole = period.get(value), summed = all.get(value)
          return { value, visitors: Math.round(whole !== undefined && summed ? (n * whole) / summed : n) }
        })
        .sort((a, b) => b.visitors - a.visitors || a.value.localeCompare(b.value))
    }
    return out
  }, [src, raceTo])
  const soFar = racing ? 'So far' : undefined
  const soFarDay = racing && view.day ? `so far · ${fmtDay(view.day)}` : undefined
  const dims = (dim: string): Row[] => {
    // Goals are their own list rather than a breakdown, but they filter like
    // any other dimension, so the filter menu asks for them the same way.
    if (dim === 'goal') return (scrubbing ? null : (src?.goals ?? null)) ?? []
    if (racing) return race[dim] ?? []
    if (scrubbing) return (day?.dims?.[dim] ?? null) ?? []
    return (src?.dims?.[dim] ?? null) ?? []
  }
  const perDay = (dim: string) => !scrubbing || ['channel', 'entry_page', 'country', 'device'].includes(dim)

  // ---- money (once a payment provider is connected) ----
  const money = src?.money
  const pm = !scrubbing && !trailData ? data?.previous?.money : undefined
  const fmtM = (minor: number) => (money ? fmtMoney(minor, money.currency, money.exponent) : '')
  const dayRev = raceK ? raceK.revenue : scrubbing ? (day?.money?.revenue ?? 0) : undefined
  const revenueNow = dayRev ?? money?.revenue
  const conv = scrubbing ? undefined : money?.conversion
  const rpv = scrubbing ? (k?.visitors ? (dayRev ?? 0) / k.visitors : 0) : money?.revenue_per_visitor


  // ---- chart ----
  const series = cur?.series ?? []
  // Each number's own day-by-day line, for the small spark in its tile.
  const dayRows = cur?.days ?? []
  const sparkOf = (f: (d: (typeof dayRows)[number]) => number) => (dayRows.length > 1 ? dayRows.map(f) : undefined)
  const values = series.map((p) => p[metric])
  const ghost = data?.previous?.series.map((p) => p[metric])
  const overlay = trailData
    ? { values: trailData.current.series.map((p) => p[metric]), color: channelColor(trail!), name: channelLabel(trail!) }
    : undefined


  const narrow = useNarrow()
  const shortDates = useMedia('(max-width: 960px)')
  const rows = full ? 12 : 5
  const vs = view.compare === 'year' ? 'vs last year' : view.compare === 'previous' ? 'vs previous period' : 'vs compared'
  const onlineNow = stream.online ?? data?.online

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
      <div className="header">
        {header}
        <div className="header-tools">
          <div className="spacer" />
        {trail && trailData && (
          <button type="button" className="chip" style={{ borderColor: channelColor(trail) }} onClick={() => addFilter('channel', trail)}>
            <span className="dot" style={{ background: channelColor(trail) }} />
            <b>Following {channelLabel(trail)}</b>
            <span className="faint" style={{ fontSize: 12 }}>
              click to keep
            </span>
          </button>
        )}
          {askOn && (
            <button type="button" className="btn ask" onClick={() => setAskOpen(true)} aria-expanded={askOpen} aria-label="Ask trckable" title={`Ask trckable (${caps(keyFor('ask')).join('')})`}>
              <ChatIcon />
              <span className="kbd">{caps(keyFor('ask')).join('')}</span>
            </button>
          )}
          {!narrow && <ModeToggle full={full} onToggle={() => setView({ mode: full ? 'core' : 'full' })} />}
          <MoreMenu
            full={full}
            askOn={askOn}
            narrow={narrow}
            onAsk={() => setAskOpen(true)}
            onMode={(m) => setView({ mode: m })}
            // A download, not a fetch: the browser writes the file, names it
            // from the header, and nothing has to be held in memory here.
            onExport={() => {
              const a = document.createElement('a')
              a.href = exportURL(site.id, query)
              a.download = ''
              a.click()
              toast('Building your file…')
            }}
            onRefresh={() => {
              dropReports(site.id)
              refresh()
              toast('Refreshed')
            }}
          />
        </div>
      </div>

      {/* The second row: what the numbers are narrowed to on the left, and
          the controls that narrow them (period, filters, saved views) on the
          right. The top row keeps who, which site and the view. */}
      <div className="toolbar">
        <div className="toolbar-filters" role={view.filters.length ? 'group' : undefined} aria-label={view.filters.length ? 'Active filters' : undefined}>
          <ActiveFilters
            filters={view.filters.map((f) => ({
              key: f.dim + '\u0000' + f.value,
              dim: DIM_LABEL[f.dim] ?? f.dim,
              value: f.dim === 'channel' ? channelLabel(f.value) : f.dim === 'country' ? countryName(f.value) : f.value,
              dot: f.dim === 'channel' ? channelColor(f.value) : undefined,
              raw: f,
            }))}
            onRemove={removeFilter}
            onClear={() => setView({ filters: [] })}
            onSave={saveView}
          />
        </div>
        <div className="toolbar-tools">
          <DatePicker
            value={pickerValue}
            today={today}
            onChange={onPicker}
            // Short from tablet down, so the header stays one row there.
            short={shortDates}
            tz={site.timezone}
            bucket={view.bucket}
            autoBucket={data?.bucket}
            onBucket={(b) => setView({ bucket: b })}
          />
          {!isShared() && (
            <FilterMenu
              rows={dims}
              labelFor={(dim, v) => (dim === 'channel' ? channelLabel(v) : dim === 'country' ? countryName(v) : v)}
              active={view.filters}
              onPick={addFilter}
              onRemove={removeFilter}
              onClear={() => setView({ filters: [] })}
            />
          )}
          {!isShared() && (segments.length > 0 || view.filters.length > 0) && (
            <SavedViews
              views={segments}
              current={current}
              canSave={view.filters.length > 0}
              onOpen={openView}
              onSave={saveView}
              onRename={renameView}
              onDelete={removeView}
              describe={(q) =>
                new URLSearchParams(q)
                  .getAll('f')
                  .map((f) => {
                    const [dim = '', ...rest] = f.split(':')
                    const v = rest.join(':')
                    return `${DIM_LABEL[dim] ?? dim} ${dim === 'channel' ? channelLabel(v) : dim === 'country' ? countryName(v) : v}`
                  })
                  .join(' · ')
              }
            />
          )}
        </div>
      </div>

      {naming && (
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
              .catch((e: Error) => toast(e.message, 'error'))
          }
        />
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

      {showInstall && <Install site={site} visits={stream.visits} />}

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
        <div className="banner">
          {money.unconverted} payment{money.unconverted > 1 ? 's' : ''} in other currencies wait for today's ECB exchange rate and aren't counted yet.
        </div>
      )}

      {waiting && (
        <p className="sample-note" aria-hidden="true">
          <KeyIcon />
          Sample data. Your own numbers appear here the moment the first visit arrives.
        </p>
      )}
      <div className={waiting ? 'sleep waiting' : 'sleep'} aria-hidden={waiting || undefined} inert={waiting}>
      {/* One section for the period at a glance: the key numbers across the
          top, the chart under them — they are one story, not two cards. */}
      <section className="card overview" aria-label="Overview">
      <div role="group" aria-label="Key numbers" className={money ? 'kpis money' : 'kpis'}>
        <Kpi loading={firstLoad} vs={vs} label="Visitors" icon={Users} spark={series.length > 1 ? series.map((p) => p.visitors) : undefined} value={k?.visitors} fmt={fmtInt} d={delta(k?.visitors ?? 0, pk?.visitors)} pressed={metric === 'visitors'} onClick={() => setMetric('visitors')}  sub={soFarDay} />
        {money ? (
          <>
            <Kpi loading={firstLoad} vs={vs} label="Revenue" icon={Banknote} spark={sparkOf((d) => d.money?.revenue ?? 0)} money value={revenueNow} fmt={fmtM} d={pm ? delta(money.revenue, pm.revenue) : null}  sub={soFarDay} />
            <Kpi loading={firstLoad} vs={vs} label="Conversion" icon={Target} spark={sparkOf((d) => (d.kpis.visitors ? (d.money?.payments ?? 0) / d.kpis.visitors : 0))} value={conv} fmt={(x) => (x * 100).toFixed(x < 0.1 ? 2 : 1) + '%'} d={pm && conv !== undefined ? delta(conv, pm.conversion) : null}  sub={soFarDay} />
            <Kpi loading={firstLoad} vs={vs} label="Per visitor" icon={Coins} spark={sparkOf((d) => (d.kpis.visitors ? (d.money?.revenue ?? 0) / d.kpis.visitors : 0))} value={rpv} fmt={(x) => fmtMoney(x, money.currency, money.exponent, { cents: true })} d={pm && rpv !== undefined ? delta(rpv, pm.revenue_per_visitor) : null}  sub={soFarDay} />
          </>
        ) : (
          <Kpi loading={firstLoad} vs={vs} label="Pageviews" icon={Eye} spark={series.length > 1 ? series.map((p) => p.pageviews) : undefined} value={k?.pageviews} fmt={fmtInt} d={delta(k?.pageviews ?? 0, pk?.pageviews)} pressed={metric === 'pageviews'} onClick={() => setMetric('pageviews')}  sub={soFarDay} />
        )}
        <Kpi loading={firstLoad} vs={vs} label="Bounce rate" icon={CornerUpLeft} spark={sparkOf((d) => d.kpis.bounce_rate)} value={k?.bounce_rate} fmt={fmtPct} d={delta(k?.bounce_rate ?? 0, pk?.bounce_rate, true)}  sub={soFarDay} />
        <Kpi loading={firstLoad} vs={vs} label="Session time" icon={Timer} spark={sparkOf((d) => d.kpis.avg_session_s)} value={k?.avg_session_s} fmt={fmtDuration} d={delta(k?.avg_session_s ?? 0, pk?.avg_session_s)}  sub={soFarDay} />
        <div className="kpi">
          <div className="label">
            <span className={'kpi-icon live' + (onlineNow ? ' on' : '')} aria-hidden="true">
              <Radio size={17} strokeWidth={1.75} />
            </span>
            Online now
          </div>
          <div className="value num">{onlineNow ?? '–'}</div>
          {/* A shared page has no live stream, so it says where the number
              comes from instead of waiting to connect forever. */}
          <div className="delta">{stream.connected || isShared() ? 'visitors in the last 5 min' : 'connecting…'}</div>
        </div>
      </div>

      {full && (
        <div className="more-numbers rise">
          <button type="button" className="more-toggle" aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)}>
            <ChevronRight size={15} strokeWidth={1.75} aria-hidden="true" />
            More numbers
            {!moreOpen && k && (
              <span className="faint num">
                {fmtInt(k.sessions)} sessions · {fmtPct(k.new_visitor_share)} new{money && !scrubbing ? ` · ${fmtInt(money.customers)} customers` : ''}
              </span>
            )}
          </button>
          {moreOpen && (
            <div className="more-grid">
              <Num label="Sessions" value={k ? fmtInt(k.sessions) : '–'} />
              <Num label="Views / session" value={k ? k.views_per_session.toFixed(2) : '–'} />
              <Num label="New visitors" value={k ? fmtPct(k.new_visitor_share) : '–'} />
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

      <div className="overview-chart" role="group" aria-label={`${metric === 'visitors' ? 'Visitors' : 'Pageviews'} over time`}>
        <div className="chart-head">
          <h2>{metric === 'visitors' ? 'Visitors' : 'Pageviews'}</h2>
          <div className="legend">
            <span>
              <i style={{ background: 'var(--accent)' }} />
              {data ? fmtRange2(data.from, data.to) : ''}
            </span>
            {data?.previous && (
              <span>
                <i className="ghost" />
                {data.previous_from && data.previous_to ? fmtRange2(data.previous_from, data.previous_to) : 'Compared'}
                {/* A flat dashed line on the axis says nothing; this does. */}
                {data.previous.series.every((p) => !p.visitors) && <em className="faint"> · no visits then</em>}
              </span>
            )}
            {overlay && (
              <span>
                <i style={{ background: overlay.color }} />
                {overlay.name}
              </span>
            )}
          </div>
        </div>
        {firstLoad ? (
          <div className="skeleton" style={{ height: 220 }} />
        ) : (
          <TimeChart
            height={narrow ? 170 : 220}
            labels={series.map((p) => p.t)}
            values={values}
            ghost={ghost}
            ghostLabels={data?.previous?.series.map((p) => p.t)}
            overlay={overlay}
            metric={metric === 'visitors' ? 'Visitors' : 'Pageviews'}
            bucket={data?.bucket ?? 'day'}
            scrub={scrubbing ? scrubIdx : null}
            partialLast={live}
            strip={money ? { values: (trailData?.current ?? cur)!.series.map((p) => p.revenue ?? 0), fmt: fmtM, label: 'Revenue' } : undefined}
            notes={notes.map((a) => ({ at: a.day, text: a.text }))}
            onAddNote={isShared() ? undefined : (day) => setNoteFor(day)}
            pulses={pulses}
            detail={(i) => {
              // The day's own numbers, when the report carried them — only
              // while the chart is by day: by week, point i is not day i.
              if (data?.bucket !== 'day') return null
              const d = cur?.days?.[i]
              if (!d) return null
              const nv = Math.round(d.kpis.visitors * d.kpis.new_visitor_share)
              const rows: { label: string; value: string; faint?: boolean }[] = [{ label: 'Pageviews', value: fmtInt(d.kpis.pageviews) }]
              // Revenue itself is already in the card, next to the bars.
              if (money && d.money) {
                rows.push({ label: 'Revenue / visitor', value: fmtMoney(d.kpis.visitors ? d.money.revenue / d.kpis.visitors : 0, money.currency, money.exponent, { cents: true }) })
              }
              rows.push({ label: 'Bounce rate', value: fmtPct(d.kpis.bounce_rate), faint: true })
              rows.push({ label: 'Session time', value: fmtDuration(d.kpis.avg_session_s), faint: true })
              const splits: { a: number; b: number; aLabel: string; bLabel: string; tone?: string; fmt?: (v: number) => string }[] = [
                { a: nv, b: Math.max(0, d.kpis.visitors - nv), aLabel: 'new', bLabel: 'returning' },
              ]
              // Where the day's money came from: a flat day can be all renewals.
              if (money && d.money && d.money.revenue > 0)
                splits.push({ a: d.money.new, b: d.money.renewal, aLabel: 'new', bLabel: 'renewals', tone: 'var(--money)', fmt: fmtM })
              return { splits, rows }
            }}
            onScrub={canScrub && full ? (i) => (setPlaying(false), setDayIdx(i)) : undefined}
          />
        )}
        {/* The replay bar, in Core too: it is the one control that makes the
            whole page move. Core leaves out the hint line. */}
        {canReplayByDay && (
          <div className="scrub">
            <button
              type="button"
              className="btn primary"
              onClick={() => (setReplaySoon(true), setView({ bucket: 'day' }))}
              aria-label="Replay this period day by day (switches the chart to days)"
              style={{ height: 38, padding: '0 14px 0 10px' }}
            >
              <Play size={15} strokeWidth={1.75} fill="currentColor" aria-hidden="true" />
              Replay
            </button>
            <SpeedMenu speed={speed} onPick={pickSpeed} />
            <span className="faint" style={{ fontSize: 12 }}>
              Plays day by day
            </span>
          </div>
        )}
        {canScrub && (
          <div className="scrub">
            <button
              type="button"
              className="btn primary"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? 'Pause replay' : 'Replay this period day by day'}
              style={{ height: 38, padding: '0 14px 0 10px' }}
            >
              {playing ? (
                <Pause size={15} strokeWidth={1.75} fill="currentColor" aria-hidden="true" />
              ) : (
                <Play size={15} strokeWidth={1.75} fill="currentColor" aria-hidden="true" />
              )}
              Replay
            </button>
            <SpeedMenu speed={speed} onPick={pickSpeed} />
            <label htmlFor="scrub" className="sr">
              Scrub through the period
            </label>
            <input
              id="scrub"
              type="range"
              min={0}
              max={series.length - 1}
              step={1}
              value={scrubbing ? scrubIdx : series.length - 1}
              aria-valuetext={scrubbing ? fmtDay(view.day!, { weekday: true }) : 'the whole period'}
              onChange={(e) => {
                setPlaying(false)
                setDayIdx(+e.target.value)
              }}
            />
            {scrubbing ? (
              <button type="button" className="btn" onClick={() => (setPlaying(false), setDayIdx(null))} style={{ height: 38, borderRadius: 999 }}>
                <span className="num">Viewing {fmtDay(view.day!, { weekday: true })}</span>
                <span className="muted">· back to the whole period</span>
              </button>
            ) : full ? (
              <span className="faint" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                Click or drag the chart to see any single day
              </span>
            ) : null}
          </div>
        )}
        {hasData && full && !isShared() && (
          <div className="note-bar">
            <button type="button" className="btn ghost" style={{ height: 30, fontSize: 12.5 }} onClick={() => setNoteFor(view.day ?? today)}>
              + Note
            </button>
            {notes.length > 0 && (
              <span className="faint" style={{ fontSize: 12 }}>
                {notes.length} note{notes.length > 1 ? 's' : ''} in this period
              </span>
            )}
          </div>
        )}
      </div>
      </section>

      {noteFor && (
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

      {full && hasData && (
        <nav className="jump rise" aria-label="Sections">
          {[
            ['Overview', 'top'],
            ['Sources', 'sec-sources'],
            ['Content', 'sec-content'],
            ['Goals & live', 'sec-goals'],
            ['Behaviour', 'sec-behaviour'],
          ].map(([label, id]) => (
            <button key={id} type="button" onClick={() => (id === 'top' ? window.scrollTo({ top: 0, behavior: 'smooth' }) : document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))}>
              {label}
            </button>
          ))}
        </nav>
      )}

      <section aria-label="Breakdowns" className="grid4" id="sec-sources">
        <TabbedCard
          title="Sources"
          // Hover must never change this card's height. A line that appeared
          // only while hovering pushed the rows down under the cursor, which
          // moved the hover to another row, which removed the line: a flicker
          // loop. Core has no line in any state; Full always has one.
          note={
            view.filters.some((f) => f.dim === 'channel')
              ? 'Filtered to one channel'
              : !full
                ? undefined
                : trail
                  ? 'Click to keep this channel'
                  : 'Hover to follow the money'
          }
          tabs={[
            { dim: 'channel', label: 'Channels' },
            { dim: 'referrer', label: 'Referrers' },
            { dim: 'campaign', label: 'Campaigns' },
            // Google's own numbers, once Search Console is connected. A share
            // link cannot reach them, so it never shows the tab.
            ...(mods?.search && !isShared() ? [{ dim: 'search', label: 'Search' }] : []),
          ]}
          render={(dim) => dim === 'search' ? (
            <SearchTerms site={site} query={query} rows={rows} full={full} />
          ) : (
            <BarList
              dimLabel={DIM_LABEL[dim]}
              valueLabel={soFar}
              loading={firstLoad}
              subLabel={full && !scrubbing ? (money ? 'Conv.' : 'Bounce') : undefined}
              onPick={(v) => addFilter(dim, v)}
              onHover={dim === 'channel' ? onSourceHover : undefined}
              money={full && money && !scrubbing ? fmtM : undefined}
              emptyText={!perDay(dim) ? 'Per-day data covers channels only' : undefined}
              items={(perDay(dim) ? (trailData && dim === 'channel' ? (cur?.dims.channel ?? []) : dims(dim)) : [])
                .slice(0, rows)
                .map((r) => ({
                  key: r.value,
                  label: dim === 'channel' ? channelLabel(r.value) : r.value || '(none)',
                  title: r.value,
                  value: r.visitors,
                  sub: full && money && !scrubbing ? (r.visitors ? (r.customers ?? 0) / r.visitors : 0) : r.bounce_rate,
                  rev: r.revenue,
                  color: dim === 'channel' ? channelColor(r.value) : undefined,
                  dim: !!trail && dim === 'channel' && r.value !== trail,
                }))}
            />
          )}
        />
        <TabbedCard
          title="Pages"
          note={!full ? undefined : trail ? `Where ${channelLabel(trail)} visitors landed` : 'Where visits start and what they read'}
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
            <ScrollDepth site={site} query={query} rows={rows} />
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
              <Suspense fallback={<div className="skeleton" style={{ height: 180 }} />}>
                <WorldMap rows={dims('country')} onPick={(c) => addFilter('country', c)} />
              </Suspense>
            ) : (
              <BarList
                dimLabel={dim === 'country' ? 'Country' : dim === 'region' ? 'Region' : 'City'}
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
      </section>

      {full && (
        <section aria-label="Goals and live visits" className="grid3 rise" id="sec-goals">
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
          ) : (
            <div className="card">
              <div className="card-head">
                <h2>Campaign sources</h2>
              </div>
              <BarList
                dimLabel="utm_campaign"
                loading={firstLoad}
                onPick={(v) => addFilter('campaign', v)}
                emptyText="No tagged campaigns in this period."
                items={(scrubbing ? [] : dims('campaign')).slice(0, rows).map((r) => ({ key: r.value, label: r.value, value: r.visitors }))}
              />
            </div>
          )}
          <LiveFeed visits={stream.visits} connected={stream.connected} onVisitor={mods?.journeys ? setJourney : undefined} />
        </section>
      )}

      {full && hasData && (mods?.funnels || mods?.rhythm || mods?.journeys || mods?.crawlers || mods?.vitals || mods?.retention) && (
        <Suspense fallback={<div className="skeleton" style={{ height: 180 }} />}>
          <section aria-label="Behaviour" className="grid2 rise" id="sec-behaviour">
            {mods?.funnels && <Funnel site={site} query={query} pages={dims('entry_page')} goals={(src?.goals ?? []) as Row[]} />}
            {mods?.rhythm && <Rhythm site={site} query={query} />}
            {mods?.journeys && <People site={site} onPick={setJourney} />}
            {mods?.crawlers && <Crawlers site={site} query={query} />}
            {mods?.vitals && <Vitals site={site} query={query} />}
            {mods?.retention && <Retention site={site} query={query} />}
          </section>
        </Suspense>
      )}

      {journey && mods?.journeys && (
        <Suspense fallback={null}>
          <JourneyDrawer site={site} visitor={journey} query={query} onClose={() => setJourney(null)} />
        </Suspense>
      )}

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

      {addGoals && (
        <Suspense fallback={null}>
          <AddGoals site={site} pages={(cur?.dims.page ?? []).map((r) => r.value)} onClose={() => setAddGoals(false)} onChanged={() => (dropReports(site.id), refresh())} />
        </Suspense>
      )}

      <AskPanel open={askOn && askOpen} onClose={() => setAskOpen(false)} site={site} sites={sites} />
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

/**
 * The phone's one-button menu. Everything that does not fit the single header
 * row lives here: Ask, the detail level and settings.
 */
/** Add or remove a note for one day. */
/** Name the view you are looking at. It says what will be kept — the range,
 *  the filters, the mode — so nobody saves one thing expecting another. */
function SaveViewDialog({ filters, onClose, onSave }: { filters: number; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Modal label="Save this view" onClose={onClose}>
      <form
        className="modal-form"
        onSubmit={(e) => {
          e.preventDefault()
          const n = name.trim()
          if (!n) return
          setBusy(true)
          onSave(n)
        }}
      >
        <h2>Save this view</h2>
        <p className="muted" style={{ margin: 0 }}>
          The date range, {filters === 0 ? 'no filters' : filters === 1 ? 'the filter' : `all ${filters} filters`}, and Core or Full — one click to come back to it, from
          the Filter menu or the row under the date picker.
        </p>
        <input
          className="input"
          style={{ height: 46 }}
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          placeholder="Search traffic, this month"
          aria-label="Name of the saved view"
          autoFocus
        />
        <DialogActions
          left={
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
          }
        >
          <button type="submit" className="btn primary big" disabled={busy || !name.trim()}>
            {busy ? 'Saving…' : 'Save view'}
          </button>
        </DialogActions>
      </form>
    </Modal>
  )
}

function MoreMenu({
  full,
  askOn,
  narrow,
  onAsk,
  onMode,
  onRefresh,
  onExport,
}: {
  full: boolean
  askOn: boolean
  narrow: boolean
  onAsk: () => void
  onMode: (m: 'core' | 'full') => void
  onRefresh: () => void
  onExport: () => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  const go = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }
  const [theme, pickTheme] = useTheme()
  return (
    <div ref={root} style={{ position: 'relative' }}>
      <button type="button" className="btn icon" aria-haspopup="menu" aria-expanded={open} aria-label="More" onClick={() => setOpen((o) => !o)}>
        <Ellipsis size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open && (
        <div className="pop menu" role="menu" style={{ top: 48, right: 0 }}>
          <button type="button" role="menuitem" onClick={go(onRefresh)}>
            <RefreshCw size={18} strokeWidth={1.75} aria-hidden="true" />
            Refresh
          </button>
          {askOn && narrow && (
            <button type="button" role="menuitem" onClick={go(onAsk)}>
              <ChatIcon />
              Ask trckable
            </button>
          )}
          {narrow && (
          <button type="button" role="menuitem" onClick={go(() => onMode(full ? 'core' : 'full'))}>
            {full ? <Minimize2 size={18} strokeWidth={1.75} aria-hidden="true" /> : <Maximize2 size={18} strokeWidth={1.75} aria-hidden="true" />}
            {full ? 'Core view' : 'Full view'}
          </button>
          )}
          {!isShared() && (
            <>
          <button type="button" role="menuitem" onClick={go(onExport)}>
            <Download size={18} strokeWidth={1.75} aria-hidden="true" />
            Export as CSV
          </button>
          <button type="button" role="menuitem" onClick={go(openShortcuts)}>
            <Keyboard size={18} strokeWidth={1.75} aria-hidden="true" />
            Shortcuts
          </button>
          <div className="menu-theme" role="group" aria-label="Theme">
            <span className="faint">Theme</span>
            <span className="seg small">
              {THEMES.map((t) => (
                <button key={t} type="button" aria-pressed={theme === t} onClick={() => pickTheme(t)}>
                  {t === 'system' ? 'Auto' : t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </span>
          </div>
          <button type="button" role="menuitem" onClick={go(() => openAccount('sites'))}>
            <CircleUser size={18} strokeWidth={1.75} aria-hidden="true" />
            Your account
          </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function KeyIcon() {
  return (
    <KeyRound size={16} strokeWidth={1.75} aria-hidden="true" />
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

function fmtRange2(from: string, to: string) {
  if (from === to) return fmtDay(from)
  return `${fmtDay(from)} – ${fmtDay(to)}`
}

function Kpi(p: {
  label: string
  icon: LucideIcon
  /** The number day by day, drawn small at the foot of the tile. */
  spark?: number[]
  value?: number
  fmt: (n: number) => string
  d: Delta | null
  vs?: string
  pressed?: boolean
  onClick?: () => void
  money?: boolean
  loading?: boolean
  /** Said under the number when there is no comparison, e.g. "so far". */
  sub?: string
}) {
  const v = useTween(p.value ?? 0, 600)
  const body = (
    <>
      <div className="label">
        <span className={'kpi-icon' + (p.money ? ' money' : '')} aria-hidden="true">
          <p.icon size={17} strokeWidth={1.75} />
        </span>
        <span className="kpi-name" title={p.label}>
          {p.label}
        </span>
      </div>
      {/* The skeleton is decorative: the loading bar at the top of the page
          is the one thing that announces loading, and it says it once. */}
      {p.loading ? (
        <div className="value skeleton" style={{ width: '62%', height: 26, borderRadius: 7 }} aria-hidden="true" />
      ) : (
        <div className="value num">{p.value === undefined ? '–' : p.fmt(v)}</div>
      )}
      <div className={`delta num ${p.d ? 'tone-' + p.d.tone : ''}`} aria-label={p.d ? `${p.d.label} ${p.vs ?? 'vs compared'}` : undefined}>
        {p.d ? `${p.d.text} ${p.vs ?? 'vs compared'}` : (p.sub ?? '')}
      </div>
      {p.spark && !p.loading && <KpiSpark values={p.spark} />}
    </>
  )
  return p.onClick ? (
    <button type="button" className={'kpi' + (p.money ? ' money' : '')} aria-pressed={p.pressed} onClick={p.onClick} title={`Chart ${p.label.toLowerCase()}`}>
      {body}
    </button>
  ) : (
    <div className={'kpi' + (p.money ? ' money' : '')}>{body}</div>
  )
}

/** A tile's small line: its number day by day, no axis, no labels — the
 *  shape of the period at a glance. */
function KpiSpark({ values }: { values: number[] }) {
  const w = 120
  const h = 28
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - min) / span) * (h - 6)] as const)
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')
  return (
    <svg className="kpi-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={`${line}L${w} ${h}L0 ${h}Z`} fill="currentColor" opacity="0.1" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

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

function ChatIcon() {
  return (
    <MessageCircle size={17} strokeWidth={1.75} aria-hidden="true" />
  )
}

