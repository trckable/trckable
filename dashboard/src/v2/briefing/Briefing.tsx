// The Briefing: the period told in order, in the walkthrough's own layout. The sentence and how it went, the day against
// its usual, the four numbers, what stood out (each opening in place, with a way to the full numbers) and what is not
// set up yet. Everything comes from the report the page already read, the site's own past (its "usual"), and the
// incident record.
import { useMemo, useState } from 'react'
import { Skeleton } from '../../components/skeleton/Skeleton'
import type { Report, Result, Site, Visit } from '../../lib/api'
import { fmtRange, presetById, todayIn, type Range } from '../../lib/dates'
import { dayWords } from '../dayWords'
import { fmtCompact, fmtInt } from '../../lib/format'
import { isShared, isViewer } from '../../lib/me'
import { openSettings } from '../../lib/settings'
import { baseEnough } from '../../lib/thin'
import { toggleWatch, watched } from '../../lib/watch'
import { useNow } from '../../features/incidents/useIncidents'
import { useNotes } from '../../features/notes/useNotes'
import { addDays } from '../../lib/dates'
import { CardList, type CardCtx } from '../ui/StoryCard'
import { Hero } from '../ui/HeroCard'
import { HeroChart, chartNote } from '../ui/DayChart'
import { KeyHint } from '../ui/KeyHint'
import { Kcs } from '../ui/KpiCard'
import { MailRow } from '../ui/MailRow'
import { WatchCard } from '../ui/WatchCard'
import { Act, Calm, Setups } from '../ui/ConnectPlaceholder'
import { Overlays } from './Overlays'
import { whyUsual } from './why'
import { ReplayBar } from '../ui/ReplayBar'
import { useReplayView } from '../replay/useReplayView'
import { startOfDay } from '../../features/incidents/model'
import { siteNow } from './chart'
import { nextStep, setupRows } from './steps'
import { copy } from './copy'
import { say as flash } from '../ui/toast'
import { goDeeper, goExplore } from './deeper'
import { useSetup, useUptime, useUsual } from './hooks'
import { bounceNote, kpiCards, noteOf, pctText, usualNote } from './kpis'
import { unitOf } from './model'
import { calmTopics, type Story } from './cards'
import { runAct } from './actions'
import { useExtras } from './useExtras'
import { useSlices } from './useSlices'
import { useBriefingKeys } from './useBriefingKeys'
import { readerOf, readerWords } from './reader'
import { useBriefingState } from './useBriefingState'
import { useRecent } from './useRecent'
import { useHistory, useHourly, wantsHours } from './useHistory'
import { useParts } from './useParts'
import { useSlice } from './useSeries'

export interface BriefingProps {
  site: Site
  data: Report | null
  loading: boolean
  period: string
  range: Range
  /** Writes an amount in the site's currency; absent where revenue is not shown. */
  money?: (minor: number) => string
  onGoal: () => void
  /** The latest visits on the site, for "meet one of them". */
  visits: Visit[]
}

const heroSub = (meet: string | null, low: boolean, fallback: string): string => {
  if (meet) return meet
  return low ? copy.fewVisitors : fallback
}

const chartLine = (learning: boolean, low: boolean, hd: number, note: () => string): string => {
  if (learning) return copy.learningNormal(hd + 1)
  return low ? copy.quietSite : note()
}

/** An empty period has no series at all (the server sends null): an empty list, so nothing below has to ask. */
const normal = (r?: Result): Result | undefined => (r ? { ...r, series: r.series ?? [] } : undefined)

export default function Briefing({ site, data: page, loading, period, range, money, onGoal, visits }: BriefingProps) {
  const ui = useBriefingState(site.id)
  const [at, setAt] = useState<number | null>(null)
  const up = useUptime(site, range)
  const nowSec = useNow()
  const setupState = useSetup(site)
  const wset = watched.use()
  const hours = useHourly(site, range, !!page && page.bucket !== 'hour' && wantsHours(period, range))
  const data = useMemo(() => (page && hours ? { ...page, bucket: hours.bucket, current: hours.current } : page), [page, hours])
  const current = data?.current
  const previous = data?.previous
  const cur0 = useMemo(() => normal(current), [current])
  const prev = useMemo(() => normal(previous), [previous])
  const unit = unitOf(period)
  const today = todayIn(site.timezone)
  const usual = useUsual(site.id, range.to, unit === 'today' || unit === 'yesterday')
  const hist = useHistory(site, today, data?.bucket === 'hour', !!data)
  const notes = useNotes(site.id, { from: addDays(today, -365), to: today }, () => undefined)
  const recent = useRecent(site.id, true)
  const goalValue = (cur0?.goals ?? []).find((g) => g.visitors > 0)?.value
  const goalSlice = useSlice(site, range, data?.bucket, goalValue ? { dim: 'goal', value: goalValue } : null)
  const downNow = !!site.down_since
  const downMin = Math.round(up.lost / 60)
  const slices = useSlices(site, range, cur0, prev, unit, cur0?.kpis.visitors ?? 0, !!cur0 && !!hist.daily)
  const extras = useExtras(site, today, !!cur0)
  const dayStart = startOfDay(today, site.timezone)
  const clock = siteNow(site.timezone, new Date(nowSec * 1000))
  const end = Number(clock.slice(11, 13)) * 60 + Number(clock.slice(14, 16))
  const rv = useReplayView({ site, today, cur: cur0, end, dayStart, slices, extras, incidents: up.list, money: money })
  const cur = rv.cur
  const parts = useParts({ site, cur, prev, usual, unit, range, today, bucket: data?.bucket, hist, up, downMin, nowSec, notes: notes.notes, slices, extras, clockAt: rv.clockAt })
  const keyed = parts?.stories.filter((x) => !rv.held(x)) ?? []
  useBriefingKeys({ cards: (ui.all ? keyed : keyed.slice(0, 4)).map((s) => s.key), ui, open: (k) => ui.setOpen(keyed.find((s) => s.key === k) ?? null) })
  if (!cur || !parts) return loading || !data ? <Skeleton height={420} label={copy.loading} /> : null
  const label = unit === 'today' ? `${presetById('today')?.label ?? 'Today'} · ${dayWords(range.to)}` : (presetById(period)?.label ?? fmtRange(range, today))
  const before = copy.before[unit]
  const { learning, scores, say, chart, uptime, low, mo, top } = parts
  const stories = parts.stories.filter((x) => !rv.held(x))
  const watchKey = (s: Story) => `${site.id}|${s.key}`
  const ctx: CardCtx = {
    know: () => null,
    onOpen: (s) => window.matchMedia('(max-width: 600px)').matches && ui.setOpen(s),
    onDeeper: (s) => goDeeper(site, s.deeper),
    watched: (s) => watchKey(s) in wset,
    onWatch: (s) => {
      if (watchKey(s) in wset) toggleWatch(watchKey(s), { at: 0, m: 0, u: '' })
      else {
        toggleWatch(watchKey(s), { at: nowSec, m: s.m, u: s.u })
        flash(copy.watchingTitle(copy.topic(s.key)), copy.watchingSub(parts.hhmm))
      }
    },
    spark: () => (slices.spark.length ? slices.spark : cur.series.map((p) => p.visitors)),
    onAct: (s) => runAct(s, { site, onGoal }) && ui.markDone(watchKey(s)),
    done: (s) => ui.done.has(watchKey(s)),
    how: (s) => ui.how.has(watchKey(s)),
    onHow: (s) => ui.toggleHow(watchKey(s)),
    focused: ui.kf,
  }
  const empty = cur.kpis.visitors === 0
  const v = cur.kpis.visitors
  const peopleNote = () => {
    if (parts.whole && !learning) return usualNote(v, parts.whole.c, parts.st)
    if (usual && usual.average >= 5 && (usual.weeks?.length ?? 0) > 0 && (unit === 'today' || unit === 'yesterday')) {
      const d = v / usual.average - 1
      if (Math.abs(d) < 0.05) return { t: copy.asUsual }
      return d > 0 ? { t: copy.vsUsual('+', Math.round(d * 100)), up: true } : { t: copy.vsUsual('−', Math.round(-d * 100)), dn: true }
    }
    return prev && baseEnough(prev.kpis.visitors) ? noteOf(v, prev.kpis.visitors, before) : { t: unit === 'today' ? copy.soFarToday : '' }
  }
  const pts = chart.points
  const pct = up.pct === null ? uptime.value : up.pct
  const kcs = kpiCards({
    cur,
    prev,
    learning,
    before,
    people: { note: peopleNote(), vals: pts.map((p) => p.v) },
    goal: goalSlice.length ? { vals: goalSlice.slice(0, pts.length) } : null,
    viewsVals: cur.series.slice(0, pts.length).map((p) => p.pageviews),
    leave: { note: bounceNote(cur.kpis.bounce_rate, parts.bounceUsual), vals: pts.map((_, i) => cur.series[i]?.bounce_rate ?? 0) },
    uptime,
    uptimePct: pctText(pct),
    uptimeVals: pts.map((_, i) => 100 * (1 - chart.downs.reduce((a, d) => a + Math.max(0, Math.min(i + 1, d.b) - Math.max(i, d.a)), 0))),
    money,
    moneyVals: cur.series.slice(0, pts.length).map((p) => p.revenue ?? 0),
  })
  const shown = stories.slice(0, 4)
  const rest = stories.slice(4)
  const act = nextStep({ site, cur, stories, top, downNow })
  const setups = setupRows({ site, cur, can: setupState.can, noSearch: setupState.noSearch, noAlerts: setupState.noAlerts, onGoal })
  const heroWhy = stories.find((x) => x.key === 'uptime')?.cause ?? stories.find((x) => x.key === 'sources')?.cause ?? (usual && parts.st ? whyUsual({ label: copy.people, now: v, weeks: usual.weeks ?? [], weekday: parts.weekday, at: parts.hhmm }) : null)
  if (kcs[0] && heroWhy && !stories.find((x) => x.key === 'uptime')) kcs[0].why = usual && parts.st ? whyUsual({ label: copy.people, now: v, weeks: usual.weeks ?? [], weekday: parts.weekday, at: parts.hhmm }) : undefined
  const sales = cur.money?.payments ?? 0
  const since =
    unit === 'today' && v > 0 ? (
      <span className="since">
        <span className="mk-pulse" />
        {copy.since(copy.thisMorning)} · <b>+{fmtInt(v)}</b> {copy.plusPeople(v)}
        {sales > 0 && (
          <>
            {' '}
            · <b>+{sales}</b> {copy.plusSales(sales)}
          </>
        )}
      </span>
    ) : undefined
  const reader = readerOf(recent.length ? recent : visits, site.domain, top?.value)
  const sub = heroSub(reader && !learning && !low ? copy.meet(readerWords(reader)) : null, low, say.sub)
  const dots = Math.min(80, Math.round(v))
  const crowd = low && !learning ? { big: v === 1 ? copy.onePerson : copy.nPeople(fmtInt(v)), n: dots, note: copy.dotNote(dots < Math.round(v) ? dots : 0) } : null
  const headline = `${say.lead} ${say.long.map((p) => p.t).join('')}`
  const watchRows = Object.entries(wset)
    .filter(([k]) => k.startsWith(site.id + '|'))
    .map(([k, w]) => {
      const s = stories.find((x) => watchKey(x) === k)
      const d = s ? s.m - w.m : 0
      return { key: k, topic: copy.topic(k.split('|')[1]), gone: !s, since: { at: new Date(w.at * 1000).toISOString().slice(11, 16), delta: `${d < 0 ? '−' : '+'}${fmtCompact(Math.abs(d))}`, unit: w.u } }
    })
  const canNote = !isViewer() && !isShared()
  return (
    <div className="mk mk-body">
      <div className="brief" aria-busy={loading}>
        <Hero
          say={{ ...say, sub }}
          scores={scores}
          learn={learning ? { day: Math.min(7, parts.hd + 1) } : null}
          crowd={crowd}
          since={since}
          period={label}
          onPeriod={() => document.querySelector<HTMLElement>('.mk-pill, .range-picker, .btn.range')?.click()}
          moments={mo}
          why={heroWhy}
          onReplay={unit === 'today' && !rv.r.on && end >= 60 && v > 0 ? rv.r.open : undefined}
          chart={
            empty ? null : (
              <div className="chwrap">
                <div className="ch-top">
                  <span className="mk-quiet" id="chNote" style={uptime.verdict === 'down' ? { color: 'var(--mk-red)' } : undefined}>
                    {chartLine(learning, low, parts.hd, () => chartNote(chart, at, downNow))}
                  </span>
                  <button type="button" className="gh nbtn" data-info="notes" onClick={() => ui.setSheet('notes')}>
                    {copy.noteBtn(notes.notes.length)}
                  </button>
                </div>
                <HeroChart c={chart} at={at} onAt={setAt} />
              </div>
            )
          }
        />
        {!empty && <Kcs items={kcs} />}
        <div className="npw" />
        <WatchCard rows={watchRows} onStop={(k) => toggleWatch(k, { at: 0, m: 0, u: '' })} />
        {empty ? <p className="mk-quiet">{copy.empty}</p> : <CardList list={shown} c={ctx} />}
        {rest.length > 0 && (
          <button type="button" className="morebtn" id="moreBtn" onClick={() => ui.setAll((a) => !a)}>
            {ui.all ? copy.hideMore(rest.length) : copy.more(rest.length)}
          </button>
        )}
        {ui.all && rest.length > 0 && <CardList list={rest} c={ctx} first={false} />}
        {!empty && <Calm cards={stories.length > 0} paused={downNow} learning={learning} names={calmTopics(stories, !setupState.noSearch && setupState.can)} onExplore={() => goExplore()} />}
        <Setups rows={setups} />
        {act && <Act text={act.text} rest={act.rest} label={act.label} onAct={act.run} />}
        {!empty && canNote && <MailRow on={ui.mail} headline={headline} onPreview={() => ui.setSheet('mail')} onManage={() => openSettings(site, 'alerts')} onToggle={ui.toggleMail} />}
        {ui.hint && <KeyHint onHide={ui.hideHint} />}
      </div>
      <ReplayBar r={rv.r} moments={rv.moments} phone={window.matchMedia('(max-width: 600px)').matches} />
      <Overlays ui={ui} site={site} range={range} today={today} notes={notes} ctx={ctx} headline={headline} kcs={kcs} shown={shown} canNote={canNote} />
    </div>
  )
}
