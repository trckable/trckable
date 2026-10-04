// Full mode's chart grid in one read (server/internal/api/charts.go): the
// same period, filters and payment mode as the report on screen.
import { call, type Bucket, type ReportQuery } from '../../lib/api'
import { filterParam } from '../../lib/filterSet'

export interface SourceBand {
  channel: string
  other?: boolean
  total: number
  values: number[]
}

export interface FlowNode {
  kind: 'page' | 'other' | 'exit'
  path?: string
  visits: number
}

export interface FlowLink {
  step: number
  from: string // a path, "(other)" or "(exit)"
  to: string
  visits: number
}

export interface ConvStep {
  kind: 'visit' | 'goal' | 'sale'
  value?: string
  visitors: number
  rate: number
}

export type ConvertSpanId = 'visit' | '3d' | '7d' | '14d' | 'more'

export interface Charts {
  labels: string[]
  sources: SourceBand[] | null
  visitors: { new: number[]; returning: number[]; unknown: number }
  flow: { visits: number; steps: (FlowNode[] | null)[]; links: FlowLink[] | null }
  conversion?: ConvStep[]
  to_convert?: { span: ConvertSpanId; sales: number }[]
}

export function chartsURL(site: string, q: ReportQuery, bucket: Bucket | undefined): string {
  const p = new URLSearchParams({ from: q.from, to: q.to })
  if (bucket) p.set('bucket', bucket)
  if (q.testPayments) p.set('payments', 'test')
  for (const f of q.filters ?? []) p.append('f', filterParam(f))
  return `/sites/${encodeURIComponent(site)}/report/charts?${p}`
}

export const fetchCharts = (site: string, q: ReportQuery, bucket: Bucket | undefined, signal?: AbortSignal) =>
  call<Charts>('GET', chartsURL(site, q, bucket), undefined, signal)
