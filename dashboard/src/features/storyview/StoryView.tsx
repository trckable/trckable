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
import { pickMarks, placePins, type Mark } from '../moments/marks'
import { useMoments } from '../moments/useMoments'
import { copy as moments } from '../moments/copy'
import { say } from '../moments/words'
import { metricName } from '../overview/chartMetric'
import { bar } from './barCopy'
import { copy } from './copy'
import { Answers } from './Answers'
import { Ask } from './Ask'
import { SetupCard } from './SetupCard'
import { sinceOf, storyOf, takeawayOf } from './rules'
import { Tiles } from './Tiles'
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

/** The room one numbered marker needs, so days close together never cover each other. */
const MARK_ROOM = 26

/** Moves markers apart to at least `gap` pixels, keeping their order and the last one where it was. */
export function spread(xs: number[], gap: number): number[] {
  const out = [...xs]
  for (let k = 1; k < out.length; k++) out[k] = Math.max(out[k], out[k - 1] + gap)
  const end = xs[xs.length - 1]
  if (out.length && out[out.length - 1] > end) {
    out[out.length - 1] = end
    for (let k = out.length - 2; k >= 0; k--) out[k] = Math.min(out[k], out[k + 1] - gap)
  }
  return out
}

/** The most the story marks: three moments, so each can be told. */
const MOMENTS = 3
const TOP = (pins: Mark[]) => pins.slice(0, MOMENTS)

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
  // The top moments by weight, one a day, then told in the order they happened.
  const marks = useMemo(() => TOP(pickMarks(placePins(pins ?? [], labels, bucket), (i) => i * 60, undefined, MOMENTS, 0)), [pins, labelsKey, bucket]) // eslint-disable-line react-hooks/exhaustive-deps -- labels are new arrays each render: keyed by content
  const fmt = p.money ?? (() => '')
  const since = useSince(p.site)
  const told = sinceOf(since.found?.items ?? [], fmt)
  const { hints, away } = useHints(p.site)
  const own = useOwnSeries(p.site.id, p.query, facts.answers)
  const open = (m: Mark) => setView({ ...patchFor(m.pin, { filters: [], range: p.range, today, bucket }), v: 'explore', story: 'moment' })

  const layer = (g: { x: (i: number) => number }) => {
    const at = spread(marks.map((m) => g.x(m.i)), MARK_ROOM)
    return (
    <div role="group" aria-label={copy.momentsTitle} style={{ display: 'contents' }}>
      {marks.map((m, n) => (
        <button key={m.pin.id} type="button" className={`sv-mark ${m.pin.kind}`} style={{ left: at[n] }} aria-label={copy.openMoment(fmtDay(m.pin.day ?? ''), say(m.pin, fmt).line)} onPointerDown={(e) => e.stopPropagation()} onClick={() => open(m)}>
          {n + 1}
        </button>
      ))}
    </div>
    )
  }
  const period = `${fmtDay(data.from)} ${bar.to} ${fmtDay(data.to)}`
  const h = facts.headline
  return (
    <div className="story-view">
      <SetupCard site={p.site} goals={(cur.goals ?? []).length > 0} revenue={!!p.money} onGoal={p.onGoal} />
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

      <Tiles tiles={facts.tiles} series={cur.series.map((x) => x.visitors)} revenue={p.money ? cur.series.map((x) => x.revenue ?? 0) : undefined} onConnect={() => setConnect(true)} />

      <Card className="sv-chart" icon={<ChartLine size={15} strokeWidth={1.8} />} title={copy.chartTitle} status={marks.length > 0 ? copy.chartHint : undefined} label={copy.chartTitle}>
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
          <ol className="sv-moments" aria-label={copy.momentsTitle}>
            {marks.length === 0 && pins && <li className="faint">{copy.noMoments}</li>}
            {marks.map((m, n) => (
              <li key={m.pin.id}>
                <button type="button" onClick={() => open(m)}>
                  <span className={`sv-n ${m.pin.kind}`}>{n + 1}</span>
                  <span>
                    <b>{fmtDay(m.pin.day ?? '')}</b> · {say(m.pin, fmt).line}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
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
