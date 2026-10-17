// The chart tabs (over time, hours, revenue map, visit to sale, time to convert, flow): the old cards' charts and the
// numbers they read, set in the section's own frame.
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { ColumnChart } from '../../../../charts/ColumnChart'
import { FlowChart } from '../../../../charts/FlowChart'
import { FunnelRows } from '../../../../charts/FunnelRows'
import { HeatGrid, HeatKey } from '../../../../charts/HeatGrid'
import { SeriesChart } from '../../../../charts/SeriesChart'
import { bucketLabel } from '../../../../charts/TimeChart'
import { Loading } from '../../../../components/loading/Loading'
import { deepCopy } from '../../../../features/cards/deepCopy'
import { copy as chartCopy } from '../../../../features/fullcharts/copy'
import { axisLabels, convertModel, flowModel, funnelModel, moneyMapModel, rhythmModel, sourcesModel, visitorsModel } from '../../../../features/fullcharts/model'
import { useCharts } from '../../../../features/fullcharts/useCharts'
import { kitLater } from '../../../../charts/kitLater'
import { fmtCompact, fmtInt } from '../../../../lib/format'
import type { Report, ReportQuery, Row } from '../../../../lib/api'
import { type Heatmap, more } from '../../../../lib/apiMore'
import { XEmpty, XNote, XSub } from '../../../ui/XBits'
import type { XCtx } from '../../ctx'
import { XChart } from './XChart'
import '../../../../charts/charts.css'

const WorldMap = lazy(() => import('../../../../views/WorldMap').then((m) => ({ default: m.WorldMap })))

export type ChartTab = 'over-time' | 'hours' | 'revenue-map' | 'visit-to-sale' | 'to-convert' | 'flow'

const HOURS = Array.from({ length: 24 }, (_, h) => chartCopy.rhythm.hour(h))
const NONE = { caption: '', columns: [], rows: [] }

function Hours({ x, query }: { x: XCtx; query: ReportQuery }) {
  const [data, setData] = useState<{ key: string; h: Heatmap } | null>(null)
  const key = x.site.id + JSON.stringify([query.from, query.to, query.filters])
  useEffect(() => {
    let live = true
    more
      .heatmap(x.site.id, query)
      .then((h) => live && setData({ key, h }))
      .catch(() => undefined)
    return () => {
      live = false
    }
    // Keyed by content: the query is a new object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const h = data?.key === key ? data.h : null
  const tz = x.site.timezone
  const c = chartCopy.rhythm
  return (
    <XChart id="rhythm" title={c.title} question={c.question} loading={!h} empty={!!h && h.total === 0} table={h ? rhythmModel(h).table : NONE} headKey={<HeatKey color="var(--accent)" fewer={c.fewer} more={c.more} />} foot={<XNote>{c.caption(tz)}</XNote>}>
      {h && <HeatGrid cells={h.cells} rows={c.days} cols={HOURS} colTicks={[0, 6, 12, 18, 23]} color="var(--accent)" label={c.label(tz)} tip={(r, col, n) => c.tip(c.days[r], col, n)} />}
    </XChart>
  )
}

function RevMap({ x, rows }: { x: XCtx; rows: Row[] }) {
  const c = chartCopy.map
  const m = moneyMapModel(rows, x.money)
  const metric = useMemo(() => ({ get: (r: Row) => r.revenue ?? 0, fmt: x.money, label: c.label, foot: c.countries, color: 'var(--money)' }), [x.money, c])
  return (
    <XChart id="money-map" title={c.title} question={c.question} table={m.table} empty={m.rows.length === 0}>
      <Suspense fallback={<Loading height={190} />}>
        <WorldMap rows={m.rows} onPick={(code) => x.pick('country', code)} metric={metric} />
      </Suspense>
    </XChart>
  )
}

function OverTime({ x, report, query }: { x: XCtx; report: Report; query: ReportQuery }) {
  const { charts } = useCharts(x.site.id, query, report.bucket)
  const [sub, setSub] = useState<'sources' | 'returning'>('sources')
  const bucket = report.bucket
  const s = charts ? sourcesModel(charts, bucket) : null
  const v = charts ? visitorsModel(charts, bucket) : null
  const labels = charts ? axisLabels(charts.labels, bucket) : []
  const tip = (i: number) => (charts ? bucketLabel(charts.labels[i], bucket, true) : '')
  return (
    <>
      <XSub label={deepCopy.tab.overTime} attr="xot" value={sub} items={[{ key: 'sources', label: deepCopy.tab.sources }, { key: 'returning', label: deepCopy.tab.returning }]} onPick={setSub} />
      {sub === 'sources' ? (
        <XChart id="sources" title={chartCopy.sources.title} question={chartCopy.sources.question} loading={!s} empty={!!s && s.series.length === 0} table={s?.table ?? NONE} legend={s?.series.map((k) => ({ label: k.label, color: k.color }))}>
          {s && charts && <SeriesChart stacked series={s.series} labels={labels} label={chartCopy.sources.label(charts.labels.length)} fmt={fmtCompact} tipTitle={tip} height={210} />}
        </XChart>
      ) : (
        <XChart id="visitors" title={chartCopy.visitors.title} question={chartCopy.visitors.question} loading={!v} table={v?.table ?? NONE} legend={v?.series.map((k) => ({ label: k.label, color: k.color, line: true }))} foot={!!charts?.visitors.unknown && <XNote>{chartCopy.visitors.unknown(charts.visitors.unknown)}</XNote>}>
          {v && <SeriesChart series={v.series} labels={labels} label={chartCopy.visitors.label} fmt={fmtCompact} tipTitle={tip} />}
        </XChart>
      )}
    </>
  )
}

function Steps({ x, report, query, tab }: { x: XCtx; report: Report; query: ReportQuery; tab: 'visit-to-sale' | 'to-convert' | 'flow' }) {
  const { charts } = useCharts(x.site.id, query, report.bucket)
  if (tab === 'flow') {
    const m = charts ? flowModel(charts) : null
    const c = chartCopy.flow
    return (
      <XChart id="flow" title={c.title} question={c.question} loading={!m} empty={!!charts && charts.flow.visits === 0} table={m?.table ?? NONE} foot={<XNote>{c.foot}</XNote>}>
        {m && <FlowChart cols={m.cols} heads={c.heads} links={m.links} fmt={fmtInt} label={c.label} boxTip={(_, b) => c.box(b.label, b.value)} bandTip={(a, b, n) => c.band(a.label, b.label, n)} />}
      </XChart>
    )
  }
  if (!charts) return <Loading height={190} />
  if (tab === 'visit-to-sale') {
    const steps = charts.conversion ?? []
    if (steps.length < 2) return <XEmpty title={kitLater.empty} hint="" />
    const m = funnelModel(steps)
    return (
      <XChart id="funnel" title={chartCopy.funnel.title} question={chartCopy.funnel.question} table={m.table} foot={<XNote>{chartCopy.funnel.foot}</XNote>}>
        <FunnelRows rows={m.rows} color="var(--accent)" label={chartCopy.funnel.label} />
      </XChart>
    )
  }
  const spans = charts.to_convert
  if (!spans || !spans.some((s) => s.sales > 0)) return <XEmpty title={kitLater.empty} hint="" />
  const m = convertModel(spans)
  const c = chartCopy.convert
  return (
    <XChart id="convert" title={c.title} question={c.question} table={m.table} empty={m.values.every((v) => v === 0)} foot={<XNote>{c.foot}</XNote>}>
      <ColumnChart values={m.values} labels={m.axis} color="var(--money)" label={c.label} fmt={fmtInt} tip={(i) => c.tip(m.labels[i], m.values[i])} />
    </XChart>
  )
}

export default function XCharts({ tab, x, report, query }: { tab: ChartTab; x: XCtx; report: Report; query: ReportQuery }) {
  if (tab === 'over-time') return <OverTime x={x} report={report} query={query} />
  if (tab === 'hours') return <Hours x={x} query={query} />
  if (tab === 'revenue-map') return <RevMap x={x} rows={report.current.revenue_dims?.country ?? []} />
  return <Steps x={x} report={report} query={query} tab={tab} />
}
