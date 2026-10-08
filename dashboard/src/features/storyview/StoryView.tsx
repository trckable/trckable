// Data's Story view: the period in one sentence, four tiles with a verdict
// each, the visitors chart with its moments numbered, and the five questions
// answered, each with a button into Explore. Rules over the report only; its
// own chunk, loaded when the view is on (Dashboard).
import { ChartLine } from 'lucide-react'
import { lazy, Suspense, useMemo, useState } from 'react'
import { Card } from '../../kit/Card'
import { TimeChart } from '../../charts/GuardedChart'
import type { Report, ReportQuery, Site } from '../../lib/api'
import { type Range } from '../../lib/dates'
import { fmtDay, todayIn } from '../../lib/dates'
import { setView } from '../../lib/url'
import { patchFor } from '../moments/apply'
import { placePins } from '../moments/marks'
import { groupSpans, pickSpans, type Span } from '../moments/spans'
import { useMoments } from '../moments/useMoments'
import { copy as moments } from '../moments/copy'
import { metricName } from '../overview/chartMetric'
import { bar } from './barCopy'
import { copy } from './copy'
import { Answers } from './Answers'
import { Sources } from './Sources'
import { sourcesOf } from './sourcesOf'
import { Ask } from './Ask'
import { MomentSpans } from './MomentSpans'
import { SetupCard } from './SetupCard'
import { sinceOf, storyOf, takeawayOf } from './rules'
import { Tiles } from './Tiles'
import { tileSeries } from './tileSeries'
import { useHints } from './useHints'
import { useOwnSeries } from './useOwnSeries'
import { useSince } from './useSince'

const ProviderCard = lazy(() => import('../overview/ProviderCard').then((m) => ({ default: m.ProviderCard })))

export interface StoryViewProps {
  site: Site
  query: ReportQuery
  data: Report
  range: Range
  /** Writes an amount; only given where revenue may be shown. */
  money?: (minor: number) => string
  narrow: boolean
  /** Opens the dialog that counts a sign-up. */
  onGoal?: () => void
}

/** The most the story tells: three moments, so each can be told. */
const MOMENTS = 3

export default function StoryView(p: StoryViewProps) {
  const { data } = p
  const cur = data.current
  const [connect, setConnect] = useState(false)
  const facts = useMemo(
    () => storyOf({ cur, prev: data.previous, money: p.money, goals: !!p.money || (cur.goals ?? []).length > 0 }),
    [cur, data.previous, p.money],
  )
  const takeaway = useMemo(() => takeawayOf({ cur, prev: data.previous, money: p.money, goals: false }), [cur, data.previous, p.money])
  const labels = cur.series.map((x) => x.t)
  const labelsKey = labels.join(',')
  const bucket = data.bucket
  const today = todayIn(p.site.timezone)
  const pins = useMoments(p.site.id, p.query, bucket)
  // Moments that belong together are one; the three that matter most, told in the order they happened.
  const marks = useMemo(() => pickSpans(groupSpans(placePins(pins ?? [], labels, bucket)), MOMENTS), [pins, labelsKey, bucket]) // eslint-disable-line react-hooks/exhaustive-deps -- labels are new arrays each render: keyed by content
  const fmt = p.money ?? (() => '')
  const since = useSince(p.site)
  const told = sinceOf(since.found?.items ?? [], fmt)
  const { hints, away } = useHints(p.site)
  const own = useOwnSeries(p.site.id, p.query, facts.answers)
  // A moment of one day opens that day, as a pin always did; a longer one opens its days.
  const open = (m: Span) =>
    m.i0 === m.i1
      ? setView({ ...patchFor(m.main, { filters: [], range: p.range, today, bucket }), v: 'explore', story: 'moment' })
      : setView({ ...patchFor(m.main, { filters: [], range: p.range, today, bucket }), period: 'custom', from: m.from, to: m.to, bucket: undefined, day: undefined, live: false, v: 'explore', story: 'moment' })
  const visitors = cur.series.map((x) => x.visitors)
  const layer = (g: { x: (i: number) => number; y: (v: number) => number; vals: number[]; w: number }) => <MomentSpans spans={marks} geo={g} site={p.site.id} visitors={visitors} narrow={p.narrow} onOpen={open} />
  const period = `${fmtDay(data.from)} ${bar.to} ${fmtDay(data.to)}`
  const h = facts.headline
  const sources = useMemo(() => sourcesOf(cur), [cur])
  return (
    <div className="story-view">
      <SetupCard site={p.site} goals={(cur.goals ?? []).length > 0} revenue={!!p.money} onGoal={p.onGoal} />
      <div className={sources ? 'sv-hero two' : 'sv-hero'}>
        <section className="sv-head" aria-label={copy.eyebrow(period)}>
          <div className="sv-eyebrow">{copy.eyebrow(period)}</div>
          <h1 className="sv-line">
            {h.pre}
            <span className="sv-strong">{h.strong}</span>
            {h.post}
          </h1>
          {told && (
            <p className="sv-since">
              <b>{since.prev ? moments.today.sinceVisit : moments.today.thisWeek}</b>
              <span>{told.line}</span>
              <button type="button" className="sv-link" onClick={() => setView({ ...patchFor(told.pin, { filters: [], range: p.range, today, bucket }), v: 'explore', story: 'moment' })}>
                {moments.today.see}
              </button>
            </p>
          )}
          {takeaway && <p className="sv-take">{takeaway}</p>}
          {h.note && <p className="sv-note">{h.note}</p>}
        </section>
        {sources && <Sources s={sources} />}
      </div>

      <Tiles tiles={facts.tiles} series={tileSeries(cur.series, !!p.money)} onConnect={() => setConnect(true)} />

      <Card className="sv-chart" icon={<ChartLine size={15} strokeWidth={1.8} />} title={copy.chartTitle} status={marks.length > 0 ? copy.chartHint(marks.length) : undefined} label={copy.chartTitle}>
        <div className="sv-chart-body">
          <div className="sv-plot" role="img" aria-label={copy.chartLabel}>
            <TimeChart
              height={p.narrow ? 170 : 240}
              labels={labels}
              values={cur.series.map((x) => x.visitors)}
              ghost={data.previous?.series.map((x) => x.visitors)}
              ghostLabels={data.previous?.series.map((x) => x.t)}
              metric={metricName('visitors')}
              bucket={bucket}
              partialLast={data.to === today}
              layer={marks.length > 0 ? layer : undefined}
            />
          </div>
        </div>
        {marks.length === 0 && pins && <p className="sv-none faint">{copy.noMoments}</p>}
      </Card>

      <Answers answers={facts.answers} onConnect={() => setConnect(true)} onGoal={p.onGoal} site={p.site} series={{ visitors: cur.series.map((x) => x.visitors), was: data.previous?.series.map((x) => x.visitors), revenue: p.money ? cur.series.map((x) => x.revenue ?? 0) : undefined, own }} hints={hints} onAway={away} />
      <Ask />
      {connect && (
        <Suspense fallback={null}>
          <ProviderCard site={p.site} onClose={() => setConnect(false)} />
        </Suspense>
      )}
    </div>
  )
}
