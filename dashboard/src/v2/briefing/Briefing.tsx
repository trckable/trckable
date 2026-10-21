// The Briefing: the period told in order, in the walkthrough's own layout. The sentence and how it went, the day against
// its usual, the four numbers, what stood out (each opening in place, with a way to the full numbers) and what is not
// set up yet. Everything comes from the report the page already read, the site's own past (its "usual"), and the
// incident record.
import { useEffect, useMemo, useState } from 'react'
import type { FunnelStep, PaidStep, Report, Result, Site, Visit } from '../../lib/api'
import { PAID_STEP } from '../explore/data/mapSections'
import { addDays, fmtRange, presetById, todayIn, type CompareMode, type Range } from '../../lib/dates'
import { dayWords } from '../dayWords'
import { fmtInt } from '../../lib/format'
import { isShared } from '../../lib/me'
import { can } from '../../lib/permissions'
import { openSettings } from '../../lib/settings'
import { toggleWatch, watched } from '../../lib/watch'
import { useNow } from '../../features/incidents/useIncidents'
import { useNotes } from '../../features/notes/useNotes'
import { CardList } from '../ui/StoryCard'
import { Hero } from '../ui/HeroCard'
import { whyRows } from './scoreWhy'
import { chartNote, chartTone } from '../ui/chartNote'
import { ChartBlock } from './ChartBlock'
import { replayInOf } from '../replay/storyIn'
import { useReplay } from '../replay/useReplay'
import { queryOf } from '../../lib/dashQuery'
import { readView } from '../../lib/url'
import { AnswersSlot } from './AnswersSlot'
import { BounceNote } from './BounceNote'
import { PaceFoot } from './PaceFoot'
import { KeyHint } from '../ui/KeyHint'
import { Kcs } from '../ui/KpiCard'
import { MailRow } from '../ui/MailRow'
import { WatchCard } from '../ui/WatchCard'
import { Act, Calm, CalmLine, Setups } from '../ui/ConnectPlaceholder'
import { Overlays } from './Overlays'
import { whyUsual } from './why'
import { useMoments } from '../replay/useMoments'
import { startOfDay } from '../../features/incidents/model'
import { siteNow } from './chart'
import { nextStep, setupRows } from './steps'
import { copy } from './copy'
import { chartLine, heroSub } from './lines'
import { againstName } from './compare'
import { LOOKED_AT, sinceOf } from './since'
import { goExplore, seeScorePart } from './deeper'
import { useSetup, useSinceCount, useUptime, useUsual } from './hooks'
import { bounceNote, kpiCards, pctText, peopleNoteOf } from './kpis'
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
import { Waiting } from '../ui/Waiting'
import { QUERY } from '../../kit/breakpoints'

export interface BriefingProps {
  site: Site
  data: Report | null
  loading: boolean
  period: string
  compare?: CompareMode // what the numbers are set against; 'none' says no change figures
  bucket?: 'hour' | 'day' | 'week' | 'month' // how the chart is cut when the person chose (absent = trckable picks)
  range: Range
  /** Writes an amount in the site's currency; absent where revenue is not shown. */
  money?: (minor: number) => string
  onGoal: () => void
  /** The latest visits on the site, for "meet one of them". */
  visits: Visit[]
  /** False while Live is the screen and this one waits, built, out of sight. */
  active?: boolean
}

/** An empty period has no series at all (the server sends null): an empty list, so nothing below has to ask. */
const normal = (r?: Result): Result | undefined => (r ? { ...r, series: r.series ?? [] } : undefined)

const stopOrGo = (playing: boolean, stop: () => void, go: () => void) => (playing ? stop : go) // Replay's button: stops what plays, starts it when it does not

export default function Briefing({ site, data: page, loading, period, compare = 'previous', bucket, range, money, onGoal, visits, active = true }: BriefingProps) {
  const ui = useBriefingState(site.id)
  const [at, setAt] = useState<number | null>(null)
  const up = useUptime(site, range)
  const nowSec = useNow()
  const setupState = useSetup(site)
  const wset = watched.use()
  const hours = useHourly(site, range, !!page && page.bucket !== 'hour' && !bucket && wantsHours(period, range), queryOf(readView(new URLSearchParams(location.search)), range))
  const data = useMemo(() => (page && hours ? { ...page, bucket: hours.bucket, current: hours.current, previous: hours.previous } : page), [page, hours]) // the period before comes by the hour too, like the line over it
  const current = data?.current
  const previous = data?.previous
  const cur = useMemo(() => normal(current), [current])
  const prev = useMemo(() => (compare === 'none' ? undefined : normal(previous)), [previous, compare])
  const unit = unitOf(period)
  const today = todayIn(site.timezone)
  const sinceCount = useSinceCount(site.id, today, LOOKED_AT, range.to === today)
  const usual = useUsual(site.id, range.to, unit === 'today' || unit === 'yesterday')
  const hist = useHistory(site, today, data?.bucket === 'hour', !!data)
  const notes = useNotes(site.id, { from: addDays(today, -365), to: today }, () => undefined)
  const recent = useRecent(site.id, true)
  const goalValue = (cur?.goals ?? []).find((g) => g.visitors > 0)?.value
  const goalSlice = useSlice(site, range, data?.bucket, goalValue ? { dim: 'goal', value: goalValue } : null)
  const downNow = !!site.down_since
  const downMin = Math.round(up.lost / 60)
  const slices = useSlices(site, range, cur, prev, unit, cur?.kpis.visitors ?? 0, !!cur && !!hist.daily)
  const stuckPage = cur?.dims.entry_page?.find((r) => r.value === '/pricing')?.value ?? cur?.dims.entry_page?.[0]?.value ?? null
  const pathSteps: (FunnelStep | PaidStep)[] = [...(cur?.dims.entry_page ?? []).slice(0, 2).map((p) => ({ kind: 'page' as const, value: p.value })), ...((cur?.goals ?? []).filter((g) => g.visitors > 0).slice(0, 1).map((g) => ({ kind: 'goal' as const, value: g.value }))), ...(cur?.money ? [PAID_STEP] : [])]
  const funnelWant = useSame(pathSteps.length >= 3 ? { steps: pathSteps, alt: (cur?.dims.entry_page ?? []).find((p) => !/signup|checkout|cart/.test(p.value) && p.value !== '/' && !pathSteps.some((x) => x.value === p.value))?.value } : null)
  const countryWant = useSame((cur?.dims.country ?? []).slice(0, 5).map((r) => ({ code: r.value, people: r.visitors })))
  const extras = useExtras(site, today, range, { money: !!cur?.money, search: setupState.can && !setupState.noSearch, page: unit === 'today' ? stuckPage : null, funnel: funnelWant, countries: countryWant }, !!cur)
  const dayStart = startOfDay(today, site.timezone)
  const clock = siteNow(site.timezone, new Date(nowSec * 1000))
  const end = Number(clock.slice(11, 13)) * 60 + Number(clock.slice(14, 16))
  const moments = useMoments({ site, today, until: end, slices, total: cur?.kpis.visitors ?? 0, extras, incidents: up.list, dayStart, sales: [], money })
  // The page is whole when everything it is told by has been read for this period (or two seconds on, whatever is missing).
  const sig = [site.id, period, range.from, range.to].join('|')
  const [late, setLate] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setLate(sig), 2500)
    return () => clearTimeout(t)
  }, [sig])
  const ready = late === sig || (!loading && !!hist.daily && slices.fresh === true && extras.fresh === true && (unit !== 'today' && unit !== 'yesterday' ? true : usual !== null))
  const parts = useParts({ site, cur, prev, against: compare === 'none' ? undefined : againstName(period, compare, range), usual, unit, range, today, bucket: data?.bucket, hist, up, downMin, nowSec, notes: notes.notes, slices, extras, money })
  // The cards keep the order the page opened with; what is new waits behind the pill.
  const lock = useCardLock([site.id, period, range.from, range.to].join('|'), parts?.stories ?? [])
  const keyed = lock.known
  useBriefingKeys({ on: active, cards: (ui.all ? keyed : keyed.slice(0, 4)).map((s) => s.key), ui, open: (k) => ui.setOpen(keyed.find((s) => s.key === k) ?? null) })
  const rp = useReplay(sig, active)
  if (!cur || !parts) return loading || !data ? <BriefingSkeleton site={site.id} label={copy.loading} /> : null
  const label = unit === 'today' ? `${presetById('today')?.label ?? 'Today'} · ${dayWords(range.to)}` : (presetById(period)?.label ?? fmtRange(range, today))
  const before = copy.before[unit]
  const { learning, scores, say, chart, uptime, low, mo, top } = parts
  const stories = parts.stories
  const ctx = cardCtx({ site, ui, wset, nowSec, hhmm: parts.hhmm, spark: slices.spark.length ? slices.spark : cur.series.map((p) => p.visitors), onGoal })
  // A day with nobody yet still has its chart and numbers once the site has a history; only a site that never had anyone is empty.
  const empty = cur.kpis.visitors === 0 && (parts.hd === 0 || !hist.daily)
  const v = cur.kpis.visitors
  const pts = chart.points
  const pct = up.pct === null ? uptime.value : up.pct
  const kcs = kpiCards({
    cur,
    prev,
    learning,
    before,
    people: { note: peopleNoteOf({ verdict: parts.verdict, learning, usual, unit, prev, v, before }), vals: pts.map((p) => p.v) },
    goal: goalSlice.length ? { vals: goalSlice.slice(0, pts.length) } : null,
    viewsVals: cur.series.slice(0, pts.length).map((p) => p.pageviews),
    leave: { note: bounceNote(cur.kpis.bounce_rate, parts.bounceUsual), vals: pts.map((_, i) => cur.series[i]?.bounce_rate ?? 0) },
    uptime,
    low,
    peopleVerdict: parts.verdict,
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
  const quiet = site.last_event_at ? <p className="mk-quiet">{copy.empty}</p> : <Waiting />
  // What else was normal ends the incident card when there is one on the page; only without it does it stand as a row of its own.
  const calmIn = { cards: stories.length > 0, paused: downNow, learning, names: calmTopics(stories, !setupState.noSearch && setupState.can) }
  const incidentOn = [...shown, ...(ui.all ? rest : [])].some((s) => s.key === 'uptime')
  const listCtx = incidentOn ? { ...ctx, calm: <div className="ic-calm"><CalmLine {...calmIn} /></div> } : ctx
  const cards = empty ? quiet : <CardList list={shown} c={listCtx} />
  const act = isShared() ? null : nextStep({ site, cur, stories, top, downNow })
  const setups = setupRows({ site, cur, can: setupState.can, shared: isShared(), noSearch: setupState.noSearch, noAlerts: setupState.noAlerts, want: setupState.want, onGoal })
  const heroWhy = stories.find((x) => x.key === 'uptime')?.cause ?? stories.find((x) => x.key === 'sources')?.cause ?? (usual && parts.st ? whyUsual({ label: copy.people, now: v, weeks: usual.weeks ?? [], weekday: parts.weekday, at: parts.hhmm }) : null)
  if (kcs[0] && heroWhy && !stories.find((x) => x.key === 'uptime')) kcs[0].why = usual && parts.st ? whyUsual({ label: copy.people, now: v, weeks: usual.weeks ?? [], weekday: parts.weekday, at: parts.hhmm }) : undefined
  const sales = cur.money?.payments ?? 0
  const lockSec = dayStart + LOOKED_AT * 3600
  const down = up.list.reduce((n, x) => n + Math.max(0, Math.min(x.ended_at ?? nowSec, nowSec) - Math.max(x.started_at, lockSec)), 0)
  const sn = unit === 'today' && v > 0 ? sinceOf({ people: sinceCount, nowMin: end, sales, downSec: down, calm: stories.length === 0 && sales === 0 }) : null
  const since = sn ? <SinceLine sn={sn} /> : undefined
  const reader = readerOf(recent.length ? recent : visits, site.domain, top?.value)
  const sub = heroSub(reader && !learning && !low ? copy.meet(readerWords(reader)) : null, low, say.sub, say.own)
  const dots = Math.min(80, Math.round(v))
  const crowd = low && !learning ? { big: v === 1 ? copy.onePerson : copy.nPeople(fmtInt(v)), n: dots, note: copy.dotNote(dots < Math.round(v) ? dots : 0) } : null
  const headline = `${say.lead} ${say.long.map((p) => p.t).join('')}`
  const watchRows = watchRowsOf(site.id, wset, stories)
  const canNote = can('note.write') && !isShared()
  const replayIn = replayInOf({ replay: rp, site, query: queryOf(readView(new URLSearchParams(location.search)), range), bucket: data?.bucket ?? 'day', chart, series: cur.series.slice(0, pts.length), total: v, today: unit === 'today', end, clock: clock.slice(11, 16), moments, period: label, source: top?.value, money: isShared() ? undefined : money, onShare: () => openSettings(site, 'sharing') })
  const onReplay = replayIn ? stopOrGo(rp.playing, rp.stop, rp.start) : undefined

  const chartBlock = { site, range, chart, at, onAt: setAt, series: cur.series.slice(0, pts.length), bucket: data?.bucket ?? 'day', money, replay: replayIn ?? undefined, note: chartLine(learning, low, parts.hd, () => chartNote(chart, at, downNow, window.matchMedia(QUERY.xs).matches)), tone: learning || low ? undefined : chartTone(chart, at, downNow), down: uptime.verdict === 'down', notes: notes.notes.length, onNotes: () => ui.setSheet('notes') }
  const body = (
    <div className="mk mk-body">
      <div className="brief" aria-busy={loading}>
        <Hero
          say={{ ...say, sub }}
          scores={scores}
          rows={whyRows(scores, parts.facts)}
          onSee={(k) => seeScorePart(site, k)}
          learn={learning ? { day: Math.min(7, parts.hd + 1) } : null}
          crowd={crowd}
          since={since}
          period={label}
          onPeriod={() => document.querySelector<HTMLElement>('#perBtn')?.click()}
          moments={mo}
          why={heroWhy}
          onReplay={onReplay}
          replaying={rp.playing}
          chart={
            empty ? null : (
              <ChartBlock {...chartBlock} />
            )
          }
        />
        {!empty && <Kcs items={kcs} foot={{ people: <PaceFoot site={site.id} today={today} range={range} /> }} />}
        <div className="npw">
          {lock.queued.length > 0 && (
            <button type="button" className="newpill" onClick={lock.release}>
              {copy.newCards(lock.queued.length)}
            </button>
          )}
        </div>
        <WatchCard rows={watchRows} onStop={(k) => toggleWatch(k, { at: 0, m: 0, u: '' })} />
        <AnswersSlot site={site} range={range} />
        {cards}
        {rest.length > 0 && (
          <button type="button" className="morebtn" id="moreBtn" onClick={() => ui.setAll((a) => !a)}>
            {ui.all ? copy.hideMore(rest.length) : copy.more(rest.length)}
          </button>
        )}
        {ui.all && rest.length > 0 && <CardList list={rest} c={listCtx} first={false} />}
        {!empty && !incidentOn && <Calm {...calmIn} onExplore={() => goExplore()} />}
        <Setups rows={setups} />
        {act && <Act text={act.text} rest={act.rest} label={act.label} onAct={act.run} />}
        <BounceNote site={site} range={range} />
        {!empty && canNote && <MailRow on={ui.mail} onPreview={() => ui.setSheet('mail')} onManage={() => openSettings(site, 'alerts')} onToggle={ui.toggleMail} />}
        {ui.hint && <KeyHint onHide={ui.hideHint} />}
      </div>
      <Overlays ui={ui} site={site} range={range} today={today} notes={notes} ctx={ctx} headline={headline} kcs={kcs} shown={shown} canNote={canNote} />
    </div>
  )
  return (
    <Hold quiet={!active} ready={ready} id={[site.id, period, range.from, range.to].join('|')} first={<BriefingSkeleton site={site.id} label={copy.loading} />}>
      {body}
    </Hold>
  )
}
