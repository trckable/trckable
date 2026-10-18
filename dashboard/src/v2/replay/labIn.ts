// What the replay lab is given by the Briefing: the points the line is drawn through (not the empty days before the site
// began), the moments the numbers hold, and today's moments from the day's record. Pure, no hooks.
import type { Bucket, Point, ReportQuery, Site } from '../../lib/api'
import { bucketLabel } from '../../charts/timeScale'
import { firstData } from '../ui/ChartMarks'
import type { ChartIn } from '../ui/DayChart'
import type { LabIn } from '../ui/LabStage'
import { seriesCaps, type Cap, type CapKind, type LabMode } from './lab'
import type { Moment, Topic } from './model'
import type { Lab } from './useLab'

const KIND: Record<Topic, CapKind> = { sources: 'source', mentions: 'mention', uptime: 'down', sales: 'sale' }

/** A day's moments as the lab tells them: "14:10 · Hacker News starts sending people". */
export function todayCaps(moments: Moment[], end: number): Cap[] {
  if (end <= 0) return []
  return moments.map((m) => {
    const [at, ...rest] = m.txt.split(' · ')
    return { pos: Math.min(1, m.min / end), at, line: rest.join(' · '), kind: m.topic ? KIND[m.topic] : 'source' }
  })
}

export function labInOf(o: {
  mode: LabMode
  lab: Lab
  site: Site
  query: ReportQuery
  bucket: Bucket
  chart: ChartIn
  series: readonly Point[]
  total: number
  today: boolean
  end: number
  clock: string
  moments: Moment[]
  period: string
  source?: string
  money?: (minor: number) => string
  onShare: () => void
}): LabIn | null {
  const f0 = firstData(o.bucket, o.series.map((x) => x.visitors))
  const series = o.series.slice(f0)
  if (series.length < 3 || o.total <= 0) return null
  const labels = series.map((x) => x.t)
  const vals = series.map((x) => x.visitors)
  const stamp = (i: number) => (o.bucket === 'hour' ? labels[i].slice(11, 16) : bucketLabel(labels[i], o.bucket))
  const last = series.length - 1
  const sale = [...(o.chart.sales ?? [])].filter((x) => !x.neg).sort((a, b) => a.at - b.at)[0]
  const base = [
    ...seriesCaps({
      vals,
      stamp,
      bucket: o.bucket,
      rise: o.chart.rise && o.chart.rise.i >= f0 ? { i: Math.min(last, o.chart.rise.i - f0), text: o.chart.rise.text } : undefined,
      sale: sale ? { i: Math.max(0, Math.min(last, Math.floor(sale.at) - f0)), text: sale.text } : undefined,
    }),
    ...(o.today ? todayCaps(o.moments, o.end) : []),
  ]
  return { mode: o.mode, lab: o.lab, site: o.site.id, query: o.query, bucket: o.bucket, labels, vals, total: o.total, base, today: o.today, end: o.end, clock: o.clock, period: o.period, source: o.source, money: o.money, onShare: o.onShare }
}
