// The Briefing: the period told in order, in the walkthrough's own layout. The sentence and how it went, the day against
// its usual, the four numbers, what stood out (each opening in place, with a way to the full numbers) and what is not
// set up yet. Everything comes from the report the page already read, the site's own past (its "usual"), and the
// incident record.
import { useEffect, useMemo, useState } from 'react'
import type { FunnelStep, PaidStep, Report, Result, Site, Visit } from '../../lib/api'
import { PAID_STEP } from '../explore/data/mapSections'
import { fmtRange, presetById, todayIn, type Range } from '../../lib/dates'
import { dayWords } from '../dayWords'
import { fmtInt } from '../../lib/format'
import { wholeMoney } from './wholeMoney'
import { isShared, isViewer } from '../../lib/me'
import { openSettings } from '../../lib/settings'
import { baseEnough } from '../../lib/thin'
import { toggleWatch, watched } from '../../lib/watch'
import { useNow } from '../../features/incidents/useIncidents'
import { useNotes } from '../../features/notes/useNotes'
import { addDays } from '../../lib/dates'
import { CardList } from '../ui/StoryCard'
import { Hero } from '../ui/HeroCard'
import { chartNote } from '../ui/DayChart'
import { ChartBlock } from './ChartBlock'
import { fmtInt as fmtN } from '../../lib/format'
import { useStoryReplay } from './useStoryReplay'
import { BounceNote } from './BounceNote'
import { PaceFoot } from './PaceFoot'
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
import { LOOKED_AT, sinceOf } from './since'
import { goExplore } from './deeper'
import { useSetup, useUptime, useUsual } from './hooks'
import { bounceNote, kpiCards, noteOf, pctText, usualNote } from './kpis'
import { unitOf } from './model'
import { calmTopics } from './cards'
import { Hold } from '../ui/Hold'
import { SinceLine } from './SinceLine'
import { cardCtx, watchRowsOf } from './cardCtx'
import { BriefingSkeleton, rememberCards } from '../ui/BriefingSkeleton'
import { useCardLock } from './useCardLock'
import { useExtras, useSame } from './useExtras'
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

const heroSub = (meet: string | null, low: boolean, fallback: string, own?: boolean): string => {
  if (meet && !own) return meet
  return low ? copy.fewVisitors : fallback
}

const chartLine = (learning: boolean, low: boolean, hd: number, note: () => string): string => {
  if (learning) return copy.learningNormal(hd + 1)
  return low ? copy.quietSite : note()
}

/** An empty period has no series at all (the server sends null): an empty list, so nothing below has to ask. */
const normal = (r?: Result): Result | undefined => (r ? { ...r, series: r.series ?? [] } : undefined)

export default function Briefing({ site, data: page, loading, period, range, money: moneyIn, onGoal, visits }: BriefingProps) {
  const money = useMemo(() => (moneyIn ? wholeMoney(moneyIn) : undefined), [moneyIn])
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
  const stuckPage = cur0?.dims.entry_page?.find((r) => r.value === '/pricing')?.value ?? cur0?.dims.entry_page?.[0]?.value ?? null
  const pathSteps: (FunnelStep | PaidStep)[] = [...(cur0?.dims.entry_page ?? []).slice(0, 2).map((p) => ({ kind: 'page' as const, value: p.value })), ...((cur0?.goals ?? []).filter((g) => g.visitors > 0).slice(0, 1).map((g) => ({ kind: 'goal' as const, value: g.value }))), ...(cur0?.money ? [PAID_STEP] : [])]
  const funnelWant = useSame(pathSteps.length >= 3 ? { steps: pathSteps, alt: (cur0?.dims.entry_page ?? []).find((p) => !/signup|checkout|cart/.test(p.value) && p.value !== '/' && !pathSteps.some((x) => x.value === p.value))?.value } : null)
  const countryWant = useSame((cur0?.dims.country ?? []).slice(0, 5).map((r) => ({ code: r.value, people: r.visitors })))
  const extras = useExtras(site, today, range, { money: !!cur0?.money, search: setupState.can && !setupState.noSearch, page: unit === 'today' ? stuckPage : null, funnel: funnelWant, countries: countryWant }, !!cur0)
  const dayStart = startOfDay(today, site.timezone)
  const clock = siteNow(site.timezone, new Date(nowSec * 1000))
  const end = Number(clock.slice(11, 13)) * 60 + Number(clock.slice(14, 16))
  const rv = useReplayView({ site, today, cur: cur0, end, dayStart, slices, extras, incidents: up.list, money: money })
  const cur = rv.cur
  // The page is whole when everything it is told by has been read for this period (or two seconds on, whatever is missing).
  const sig = [site.id, period, range.from, range.to].join('|')
  const [late, setLate] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setLate(sig), 2500)
    return () => clearTimeout(t)
  }, [sig])
  const ready = late === sig || (!loading && !!hist.daily && slices.fresh === true && extras.fresh === true && (unit !== 'today' && unit !== 'yesterday' ? true : usual !== null))
  const parts = useParts({ site, cur, prev, usual, unit, range, today, bucket: data?.bucket, hist, up, downMin, nowSec, notes: notes.notes, slices, extras, money, clockAt: rv.clockAt })
  // The cards keep the order the page opened with; what is new waits behind the pill.
  const lock = useCardLock([site.id, period, range.from, range.to].join('|'), parts?.stories.filter((x) => !rv.held(x)) ?? [])
  const keyed = lock.known
  useBriefingKeys({ cards: (ui.all ? keyed : keyed.slice(0, 4)).map((s) => s.key), ui, open: (k) => ui.setOpen(keyed.find((s) => s.key === k) ?? null) })
  const storyR = useStoryReplay(cur0?.series.length ?? 0)
  if (!cur || !parts) return loading || !data ? <BriefingSkeleton site={site.id} label={copy.loading} /> : null
  const label = unit === 'today' ? `${presetById('today')?.label ?? 'Today'} · ${dayWords(range.to)}` : (presetById(period)?.label ?? fmtRange(range, today))
  const before = copy.before[unit]
  const { learning, scores, say, chart, uptime, low, mo, top } = parts
  const stories = parts.stories.filter((x) => !rv.held(x))
  const ctx = cardCtx({ site, ui, wset, nowSec, hhmm: parts.hhmm, spark: slices.spark.length ? slices.spark : cur.series.map((p) => p.visitors), onGoal })
  // A day with nobody yet still has its chart and numbers once the site has a history; only a site that never had anyone is empty.
  const empty = cur.kpis.visitors === 0 && (parts.hd === 0 || !hist.daily)
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
    low,
    peopleBand: parts.whole,
    moneyBand: parts.moneyBand,
    goalBand: slices.goals.find((g) => g.value === goalValue)?.band ?? null,
    uptimePct: pctText(pct),
    uptimeVals: pts.map((_, i) => 100 * (1 - chart.downs.reduce((a, d) => a + Math.max(0, Math.min(i + 1, d.b) - Math.max(i, d.a)), 0))),
    money,
    moneyVals: cur.series.slice(0, pts.length).map((p) => p.revenue ?? 0),
  })
  const shown = lock.known.slice(0, 4)
  rememberCards(site.id, shown.map((x) => x.key))
  const rest = lock.known.slice(4)
  const act = isShared() ? null : nextStep({ site, cur, stories, top, downNow })
  const setups = setupRows({ site, cur, can: setupState.can, noSearch: setupState.noSearch, noAlerts: setupState.noAlerts, onGoal })
  const heroWhy = stories.find((x) => x.key === 'uptime')?.cause ?? stories.find((x) => x.key === 'sources')?.cause ?? (usual && parts.st ? whyUsual({ label: copy.people, now: v, weeks: usual.weeks ?? [], weekday: parts.weekday, at: parts.hhmm }) : null)
  if (kcs[0] && heroWhy && !stories.find((x) => x.key === 'uptime')) kcs[0].why = usual && parts.st ? whyUsual({ label: copy.people, now: v, weeks: usual.weeks ?? [], weekday: parts.weekday, at: parts.hhmm }) : undefined
  const sales = cur.money?.payments ?? 0
  const lockSec = dayStart + LOOKED_AT * 3600
  const down = up.list.reduce((n, x) => n + Math.max(0, Math.min(x.ended_at ?? nowSec, nowSec) - Math.max(x.started_at, lockSec)), 0)
  const sn = unit === 'today' && v > 0 ? sinceOf({ series: cur.series, nowMin: end, sales, downSec: down, calm: stories.length === 0 && sales === 0 }) : null
  const since = sn ? <SinceLine sn={sn} /> : undefined
  const reader = readerOf(recent.length ? recent : visits, site.domain, top?.value)
  const sub = heroSub(reader && !learning && !low ? copy.meet(readerWords(reader)) : null, low, say.sub, say.own)
  const dots = Math.min(80, Math.round(v))
  const crowd = low && !learning ? { big: v === 1 ? copy.onePerson : copy.nPeople(fmtInt(v)), n: dots, note: copy.dotNote(dots < Math.round(v) ? dots : 0) } : null
  const headline = `${say.lead} ${say.long.map((p) => p.t).join('')}`
  const watchRows = watchRowsOf(site.id, wset, stories)
  const canNote = !isViewer() && !isShared()
  const replayStory = /* any period but today plays as a story */ pts.length > 1 && v > 0 && storyR.phase === 'off' ? storyR.start : undefined
  const replayToday = !rv.r.on && end >= 60 && v > 0 ? rv.r.open : undefined
  const chartBlock = { site, range, chart, at, onAt: setAt, story: storyR, series: cur.series.slice(0, pts.length), bucket: data?.bucket ?? 'day', money: moneyIn, total: fmtN(v), source: top?.value, note: chartLine(learning, low, parts.hd, () => chartNote(chart, at, downNow, window.matchMedia('(max-width: 500px)').matches)), down: uptime.verdict === 'down', notes: notes.notes.length, onNotes: () => ui.setSheet('notes') }
  const body = (

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
          onReplay={unit === 'today' ? replayToday : replayStory}
          chart={
            empty ? null : (
              <ChartBlock {...chartBlock} />
            )
          }
        />
        {!empty && <Kcs items={kcs} foot={{ people: <PaceFoot site={site.id} today={today} live={range.to === today} /> }} />}
        <div className="npw">
          {lock.queued.length > 0 && (
            <button type="button" className="newpill" onClick={lock.release}>
              {copy.newCards(lock.queued.length)}
            </button>
          )}
        </div>
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
        <BounceNote site={site} range={range} />
        {!empty && canNote && <MailRow on={ui.mail} headline={headline} onPreview={() => ui.setSheet('mail')} onManage={() => openSettings(site, 'alerts')} onToggle={ui.toggleMail} />}
        {ui.hint && <KeyHint onHide={ui.hideHint} />}
      </div>
      <ReplayBar r={rv.r} moments={rv.moments} phone={window.matchMedia('(max-width: 600px)').matches} />
      <Overlays ui={ui} site={site} range={range} today={today} notes={notes} ctx={ctx} headline={headline} kcs={kcs} shown={shown} canNote={canNote} />
    </div>
  )
  return (
    <Hold ready={ready} id={[site.id, period, range.from, range.to].join('|')} first={<BriefingSkeleton site={site.id} label={copy.loading} />}>
      {body}
    </Hold>
  )
}
