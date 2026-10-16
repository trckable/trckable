// The Briefing: the period told in order, in the walkthrough's own layout. The sentence and how it went, the day against
// its usual, the four numbers, what stood out (each opening in place, with a way to the full numbers) and what is not
// set up yet. Everything comes from the report the page already read, the server's "usual", and the incident record.
import { useEffect, useMemo, useState } from 'react'
import { Skeleton } from '../../components/skeleton/Skeleton'
import { tag } from '../../i18n'
import { call, rangeQS, type Report, type Result, type Site } from '../../lib/api'
import { more } from '../../lib/apiMore'
import { fmtRange, presetById, todayIn, type Range } from '../../lib/dates'
import { dayWords } from '../dayWords'
import { delta, fmtCompact, fmtInt, fmtPct } from '../../lib/format'
import { isShared, isViewer } from '../../lib/me'
import { openSettings } from '../../lib/settings'
import { baseEnough, tooFew } from '../../lib/thin'
import { toggleWatch, watched } from '../../lib/watch'
import { startOfDay, uptimeOf } from '../../features/incidents/model'
import { useNow, usePeriodIncidents } from '../../features/incidents/useIncidents'
import { CardList, type CardCtx } from '../ui/StoryCard'
import { chartOf, siteNow } from './chart'
import { copy } from './copy'
import { Detail } from '../ui/DetailSheet'
import { goDeeper, goExplore } from './deeper'
import { Hero } from '../ui/HeroCard'
import { HeroChart, chartNote } from '../ui/DayChart'
import { Kcs, type Kc } from '../ui/KpiCard'
import { engagementScore, rank, sentence, topSource, trafficScore, unitOf, uptimeScore, type Story, type Usual } from './model'
import { Act, Calm, Setups, type Setup } from '../ui/ConnectPlaceholder'

export interface BriefingProps {
  site: Site
  data: Report | null
  loading: boolean
  period: string
  range: Range
  /** Writes an amount in the site's currency; absent where revenue is not shown. */
  money?: (minor: number) => string
  onGoal: () => void
}

const weekdayOf = (day: string) => new Date(day + 'T12:00:00Z').toLocaleDateString(tag ?? 'en-US', { weekday: 'long', timeZone: 'UTC' })

/** What the server calls usual for the day (the same weekday, up to the same time), for today and yesterday. */
function useUsual(site: string, day: string, on: boolean): Usual | null {
  const [got, setGot] = useState<{ key: string; usual: Usual } | null>(null)
  const key = `${site}|${day}`
  useEffect(() => {
    if (!on) return
    let live = true
    call<Usual>('GET', `/sites/${encodeURIComponent(site)}/usual` + rangeQS({ from: day, to: day }), undefined, undefined, true).then(
      (usual) => live && setGot({ key, usual }),
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [key, site, day, on])
  return got && got.key === key ? got.usual : null
}

/** The incident record over the period, said as the scores, the chart and the cards need it. */
function useUptime(site: Site, range: Range) {
  const now = useNow()
  const from0 = startOfDay(range.from, site.timezone)
  const to = Math.min(startOfDay(range.to, site.timezone) + 86400, now)
  const from = Math.min(Math.max(from0, site.watched_since ?? 0), to)
  const { summary, list, ready } = usePeriodIncidents(site.id, from, to, !isShared())
  const lost = summary?.seconds ?? 0
  const up = summary && ready ? uptimeOf(to - from, lost) : null
  return { pct: up?.pct ?? null, lost, list, from0 }
}

/** What each part of the site's own setup is, for the quiet rows: asked once, never blocking. */
function useSetup(site: Site) {
  const [alerts, setAlerts] = useState(false)
  const [search, setSearch] = useState(false)
  const can = !isShared() && !isViewer()
  useEffect(() => {
    if (!can) return
    let live = true
    more.alerts(site.id).then((r) => live && setAlerts(r.alerts.length === 0), () => undefined)
    more.searchConsole(site.id).then((r) => live && setSearch(!r.connected), () => undefined)
    return () => {
      live = false
    }
  }, [site.id, can])
  return { can, noAlerts: alerts, noSearch: search }
}

function note(now: number, was: number | undefined, before: string): Kc['note'] {
  const d = delta(now, was)
  if (!d || d.tone === 'flat') return { t: copy.asUsual }
  const pct = Math.round(Math.abs(((now - (was as number)) / (was as number)) * 100))
  return d.tone === 'up' ? { t: copy.vsBefore('+', pct, before), up: true } : { t: copy.vsBefore('−', pct, before), dn: true }
}

/** An empty period has no series at all (the server sends null): an empty list, so nothing below has to ask. */
const normal = (r?: Result): Result | undefined => (r ? { ...r, series: r.series ?? [] } : undefined)

const series = (r: Report['current']['series'], f: (p: Report['current']['series'][number]) => number | undefined) => r.map(f).filter((v): v is number => v !== undefined)

export default function Briefing({ site, data, loading, period, range, money, onGoal }: BriefingProps) {
  const [open, setOpen] = useState<Story | null>(null)
  const [all, setAll] = useState(false)
  const [at, setAt] = useState<number | null>(null)
  const up = useUptime(site, range)
  const nowSec = useNow()
  const setupState = useSetup(site)
  const wset = watched.use()
  const current = data?.current
  const previous = data?.previous
  const cur = useMemo(() => normal(current), [current])
  const prev = useMemo(() => normal(previous), [previous])
  const unit = unitOf(period)
  const usual = useUsual(site.id, range.to, unit === 'today' || unit === 'yesterday')
  const downNow = !!site.down_since
  const downMin = Math.round(up.lost / 60)
  const parts = useMemo(() => {
    if (!cur) return null
    const age = site.created_at ? (nowSec - site.created_at) / 86400 : 99
    const learning = age < 7 && !(prev && baseEnough(prev.kpis.visitors))
    const off = !site.watched_since
    const weekday = weekdayOf(range.to)
    const uptime = uptimeScore({ pct: up.pct, downNow, downMin, off })
    const scores = [trafficScore(cur, prev), engagementScore(cur, prev), uptime]
    const stories = rank({ cur, prev, unit, self: site.domain, downNow, downWhy: site.down_cause, downMin })
    const say = sentence({ cur, prev, usual, unit, weekday, self: site.domain, downMin, learning })
    const top = topSource(cur, prev, site.domain)
    const downs = up.list.flatMap((x) => {
      const hourly = data?.bucket === 'hour'
      const per = hourly ? 3600 : 86400
      const a = (Math.max(x.started_at, up.from0) - up.from0) / per
      const b = ((x.ended_at ?? nowSec) - up.from0) / per
      return b > a ? [{ a, b, min: Math.round(((x.ended_at ?? nowSec) - x.started_at) / 60), now: x.ended_at === null }] : []
    })
    const chart = chartOf({ cur, prev, bucket: data?.bucket ?? 'day', unit, nowT: range.to === todayIn(site.timezone, new Date(nowSec * 1000)) ? siteNow(site.timezone, new Date(nowSec * 1000)) : undefined, weekday, riseName: top?.times && top.times >= 1.5 ? top.name : undefined, downs })
    return { learning, age, uptime, scores, stories, say, top, chart, weekday }
  }, [cur, prev, usual, unit, up.pct, up.list, up.from0, downNow, downMin, site.domain, site.down_cause, site.created_at, site.watched_since, site.timezone, range.to, data?.bucket, nowSec])
  if (!cur || !parts) return loading || !data ? <Skeleton height={420} label={copy.loading} /> : null
  const today = todayIn(site.timezone)
  const label = unit === 'today' ? `${presetById('today')?.label ?? 'Today'} · ${dayWords(range.to)}` : (presetById(period)?.label ?? fmtRange(range, today))
  const before = copy.before[unit]
  const known = (s: Story) => ({ sources: copy.sourceKnow, pages: copy.pageKnow, countries: copy.countryKnow, goals: copy.goalKnow, uptime: copy.downKnow })[s.key]
  const ctx: CardCtx = {
    usual: parts.top ? Math.round(parts.top.visitors / Math.max(1, parts.top.times ?? 1)) : 0,
    who: parts.top?.name ?? '',
    know: (s) => `${usual ? copy.weekdayRule(parts.weekday, '') : copy.periodRule} ${known(s)}`,
    onOpen: setOpen,
    onDeeper: (s) => goDeeper(site, s.deeper),
    watched: (s) => wset.includes(`${site.id}|${s.key}`),
    onWatch: (s) => toggleWatch(`${site.id}|${s.key}`),
    spark: () => series(cur.series, (p) => p.visitors),
  }
  const { learning, scores, stories, say, chart, uptime } = parts
  const empty = cur.kpis.visitors === 0
  const v = cur.kpis.visitors
  const goal = (cur.goals ?? []).find((g) => g.visitors > 0)
  const uPct = uptime.value === null ? '–' : `${Number.isInteger(up.pct ?? uptime.value) || up.pct === null ? uptime.value : up.pct.toFixed(1)}%`
  const peopleNote = (): Kc['note'] => {
    if (learning) return { t: copy.learning }
    if (usual && usual.average >= 5 && (usual.weeks?.length ?? 0) > 0 && (unit === 'today' || unit === 'yesterday')) {
      const d = v / usual.average - 1
      if (Math.abs(d) < 0.05) return { t: copy.asUsual }
      return d > 0 ? { t: copy.vsUsual('+', Math.round(d * 100)), up: true } : { t: copy.vsUsual('−', Math.round(-d * 100)), dn: true }
    }
    return prev && baseEnough(prev.kpis.visitors) ? note(v, prev.kpis.visitors, before) : { t: unit === 'today' ? copy.soFarToday : '' }
  }
  const kcs: Kc[] = [
    { key: 'people', icon: 'people', label: copy.people, val: fmtInt(v), note: peopleNote(), vals: series(cur.series, (p) => p.visitors), dn: false },
    goal
      ? { key: 'goal', icon: 'goal', label: (goal.label || goal.value).replace(/^./, (c) => c.toUpperCase()), val: fmtInt(goal.visitors), note: learning ? { t: copy.learning } : note(goal.visitors, prev?.goals?.find((g) => g.value === goal.value)?.visitors, before), vals: [], col: '#7f9cf5' }
      : { key: 'views', icon: 'click', label: copy.views, val: fmtCompact(cur.kpis.pageviews), note: learning ? { t: copy.learning } : note(cur.kpis.pageviews, prev?.kpis.pageviews, before), vals: series(cur.series, (p) => p.pageviews), col: '#7f9cf5' },
    { key: 'uptime', icon: 'uptime', label: copy.uptimeCard, val: uPct, note: { t: uptime.verdict === 'clear' ? copy.noDowntime : uptime.words, dn: uptime.verdict === 'lost' || uptime.verdict === 'down' }, vals: uptime.value === null ? [] : [100, 100, 100], lo: 90, hi: 117, dn: uptime.verdict === 'down' || uptime.verdict === 'lost' },
    cur.money && money
      ? { key: 'money', icon: 'sales', label: copy.net(cur.money.payments), val: money(cur.money.revenue), note: learning ? { t: copy.soFarToday } : note(cur.money.revenue, prev?.money?.revenue, before), vals: series(cur.series, (p) => p.revenue) }
      : { key: 'leave', icon: 'leave', label: copy.left, val: tooFew(cur.kpis.sessions) ? '–' : fmtPct(cur.kpis.bounce_rate), note: learning || tooFew(cur.kpis.sessions) ? { t: copy.soFarToday } : { ...note(cur.kpis.bounce_rate, prev?.kpis.bounce_rate, before), up: false, dn: false }, vals: series(cur.series, (p) => (p.bounce_rate === undefined ? undefined : p.bounce_rate)), lo: 0, hi: 0.8, col: '#7f9cf5' },
  ]
  const shown = all ? stories : stories.slice(0, 4)
  const rest = stories.slice(4)
  const act = (() => {
    if (downNow) return { text: copy.actDown(site.domain), label: copy.actDownBtn, run: () => goDeeper(site, { kind: 'incidents' }) }
    const s = stories[0]
    if (parts.top && parts.top.times && parts.top.times > 2 && s?.key === 'sources') return { text: copy.actSource(parts.top.name), rest: copy.actSourceRest(fmtPct(cur.kpis.bounce_rate)), label: copy.actSourceBtn, run: () => goDeeper(site, s.deeper) }
    const page = cur.dims.entry_page?.find((r) => r.value !== '/')
    return page ? { text: copy.actPage(page.value), rest: copy.actPageRest, label: copy.actPageBtn(page.value), run: () => goDeeper(site, { kind: 'explore', filter: { dim: 'entry_page', value: page.value } }) } : null
  })()
  const setups: Setup[] = []
  if (setupState.can) {
    if (!cur.money) setups.push({ key: 'rev', icon: 'sales', t: copy.revT, d: copy.revD, b: copy.connect, how: copy.revHow, act: () => openSettings(site, 'payments') })
    if (setupState.noSearch) setups.push({ key: 'search', icon: 'search', t: copy.searchT, d: copy.searchD, b: copy.connect, how: copy.searchHow, act: () => openSettings(site, 'search') })
    if (!goal && (cur.goals ?? []).length === 0) setups.push({ key: 'goals', icon: 'goals', t: copy.goalsT, d: copy.goalsD, b: copy.setUp, how: copy.goalsHow, act: onGoal })
    if (!site.watched_since) setups.push({ key: 'uptime', icon: 'uptime', t: copy.uptimeT, d: copy.uptimeD, b: copy.turnOn, how: copy.uptimeHow, act: () => openSettings(site, 'health') })
    if (setupState.noAlerts) setups.push({ key: 'alerts', icon: 'setup', t: copy.alertsT, d: copy.alertsD, b: copy.turnOn, how: copy.alertsHow, act: () => openSettings(site, 'alerts') })
  }
  const sales = cur.money?.payments ?? 0
  const since =
    unit === 'today' && v > 0 ? (
      <span className="since">
        <span className="pulse" />
        {copy.since(copy.thisMorning)} · <b>+{fmtInt(v)}</b> {copy.plusPeople(v)}
        {sales > 0 && (
          <>
            {' '}
            · <b>+{sales}</b> {copy.plusSales(sales)}
          </>
        )}
      </span>
    ) : undefined
  return (
    <div className="mk mk-body">
      <div className="brief" aria-busy={loading}>
        <Hero
          say={say}
          scores={scores}
          learn={learning ? { day: Math.min(7, Math.floor(parts.age) + 1) } : null}
          since={since}
          period={label}
          onPeriod={() => document.querySelector<HTMLElement>('.range-picker, .btn.range, .pill')?.click()}
          chart={
            empty ? null : (
              <div className="chwrap">
                <div className="ch-top">
                  <span className="quiet" id="chNote" style={uptime.verdict === 'down' ? { color: 'var(--mk-red)' } : undefined}>
                    {chartNote(chart, at)}
                  </span>
                  <button type="button" className="gh nbtn">
                    {copy.noteBtn(chart.notes.length)}
                  </button>
                </div>
                <HeroChart c={chart} at={at} onAt={setAt} />
              </div>
            )
          }
        />
        {!empty && <Kcs items={kcs} />}
        {empty ? <p className="quiet">{copy.empty}</p> : <CardList list={shown} c={ctx} />}
        {rest.length > 0 && (
          <button type="button" className="morebtn" id="moreBtn" onClick={() => setAll((a) => !a)}>
            {all ? copy.hideMore(rest.length) : copy.more(rest.length)}
          </button>
        )}
        {!empty && <Calm others={stories.length > 0} onExplore={() => goExplore()} />}
        <Setups rows={setups} />
        {act && <Act text={act.text} rest={act.rest} label={act.label} onAct={act.run} />}
      </div>
      {open && <Detail s={open} site={site.domain} c={ctx} onClose={() => setOpen(null)} />}
    </div>
  )
}

