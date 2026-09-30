// The grid's data turned into what each chart draws and what its table
// lists. Pure functions: model.test.ts checks every card's numbers.
import { bucketLabel } from '../../charts/TimeChart'
import type { TableData } from '../../charts/DataTable'
import type { FlowCol } from '../../charts/FlowChart'
import type { FunnelRow } from '../../charts/FunnelRows'
import type { Series } from '../../charts/SeriesChart'
import type { Bucket, Heatmap, Row } from '../../lib/api'
import { countryName, fmtInt, fmtPct } from '../../lib/format'
import { channelColor, channelLabel } from '../../lib/palette'
import type { Charts, ConvStep, FlowNode } from './api'
import { copy } from './copy'

// Two series compared on one axis: the first two colours of the validated
// channel palette (blue and orange: apart for every kind of colour vision).
export const NEW_COLOR = 'var(--ch-1)'
export const RETURNING_COLOR = 'var(--ch-2)'
export const OTHER_COLOR = 'var(--text-3)'

export function axisLabels(labels: string[], bucket: Bucket): string[] {
  return labels.map((t) => bucketLabel(t, bucket))
}

export function sourcesModel(c: Charts, bucket: Bucket): { series: Series[]; table: TableData } {
  const bands = c.sources ?? []
  const series = bands.map((b) => ({
    label: b.other ? copy.sources.other : channelLabel(b.channel),
    color: b.other ? OTHER_COLOR : channelColor(b.channel),
    values: b.values,
  }))
  return {
    series,
    table: {
      caption: copy.sources.title,
      columns: [copy.sources.when, ...series.map((s) => s.label)],
      rows: c.labels.map((t, i) => [bucketLabel(t, bucket, true), ...series.map((s) => fmtInt(s.values[i] ?? 0))]),
    },
  }
}

export function visitorsModel(c: Charts, bucket: Bucket): { series: Series[]; table: TableData } {
  const series = [
    { label: copy.visitors.new, color: NEW_COLOR, values: c.visitors.new },
    { label: copy.visitors.returning, color: RETURNING_COLOR, values: c.visitors.returning },
  ]
  return {
    series,
    table: {
      caption: copy.visitors.title,
      columns: [copy.sources.when, copy.visitors.new, copy.visitors.returning],
      rows: c.labels.map((t, i) => [bucketLabel(t, bucket, true), fmtInt(c.visitors.new[i] ?? 0), fmtInt(c.visitors.returning[i] ?? 0)]),
    },
  }
}

const stepLabel = (s: ConvStep) => {
  if (s.kind === 'visit') return copy.funnel.visit
  if (s.kind === 'sale') return copy.funnel.sale
  return copy.funnel.goal(s.value ?? '')
}

export function funnelModel(steps: ConvStep[]): { rows: FunnelRow[]; table: TableData } {
  const top = Math.max(1, steps[0]?.visitors ?? 1)
  const rows = steps.map((s, i): FunnelRow => {
    const row = { label: stepLabel(s), count: fmtInt(s.visitors), share: s.visitors / top }
    if (i === 0) return row
    const before = steps[i - 1].visitors
    const left = Math.max(0, before - s.visitors)
    return { ...row, of: fmtPct(s.rate), drop: copy.funnel.lost(Math.round((left / Math.max(1, before)) * 100), left) }
  })
  return {
    rows,
    table: {
      caption: copy.funnel.title,
      columns: [copy.funnel.step, copy.funnel.visitors, copy.funnel.rate],
      rows: steps.map((s, i) => [stepLabel(s), fmtInt(s.visitors), i ? fmtPct(s.rate) : '–']),
    },
  }
}

export function convertModel(spans: NonNullable<Charts['to_convert']>): { labels: string[]; axis: string[]; values: number[]; table: TableData } {
  const labels = spans.map((s) => copy.convert.spans[s.span])
  const axis = spans.map((s) => copy.convert.short[s.span])
  const values = spans.map((s) => s.sales)
  return {
    labels,
    axis,
    values,
    table: { caption: copy.convert.title, columns: [copy.convert.span, copy.convert.sales], rows: spans.map((s, i) => [labels[i], fmtInt(s.sales)]) },
  }
}

/** The heatmap arrives Monday-first ([weekday][hour], server/internal/query). */
export function rhythmModel(h: Heatmap): { table: TableData } {
  return {
    table: {
      caption: copy.rhythm.title,
      columns: [copy.rhythm.weekday, ...Array.from({ length: 24 }, (_, i) => copy.rhythm.hour(i)), copy.rhythm.total],
      rows: copy.rhythm.days.map((d, r) => {
        const row = h.cells[r] ?? []
        return [d, ...Array.from({ length: 24 }, (_, i) => fmtInt(row[i] ?? 0)), fmtInt(row.reduce((a, b) => a + b, 0))]
      }),
    },
  }
}

export function moneyMapModel(rows: Row[], fmtMoney: (n: number) => string): { rows: Row[]; table: TableData } {
  const paid = rows.filter((r) => (r.revenue ?? 0) > 0)
  return {
    rows: paid,
    table: {
      caption: copy.map.title,
      columns: [copy.map.country, copy.map.revenue, copy.map.customers],
      rows: paid.map((r) => [countryName(r.value), fmtMoney(r.revenue ?? 0), fmtInt(r.customers ?? 0)]),
    },
  }
}

const MAX_PATH = 22

/** A path short enough for a flow label: the end is what tells pages apart. */
export function shortPath(p: string): string {
  return p.length <= MAX_PATH ? p : '…' + p.slice(p.length - MAX_PATH + 1)
}

const nodeKey = (n: FlowNode) => {
  if (n.kind === 'exit') return '(exit)'
  if (n.kind === 'other') return '(other)'
  return n.path ?? ''
}

const nodeLabel = (n: FlowNode) => {
  if (n.kind === 'exit') return copy.flow.exit
  if (n.kind === 'other') return copy.flow.other
  return shortPath(n.path ?? '')
}

export function flowModel(c: Charts): { cols: FlowCol[][]; links: { col: number; from: string; to: string; value: number }[]; table: TableData } {
  const cols = c.flow.steps.map((col) =>
    (col ?? []).map((n) => ({ key: nodeKey(n), label: nodeLabel(n), value: n.visits, kind: n.kind })),
  )
  const links = (c.flow.links ?? []).map((l) => ({ col: l.step, from: l.from, to: l.to, value: l.visits }))
  const name = (col: number, key: string) => cols[col]?.find((n) => n.key === key)?.label ?? key
  return {
    cols,
    links,
    table: {
      caption: copy.flow.title,
      columns: [copy.flow.from, copy.flow.to, copy.flow.visits],
      rows: links.map((l) => [name(l.col, l.from), name(l.col + 1, l.to), fmtInt(l.value)]),
    },
  }
}
