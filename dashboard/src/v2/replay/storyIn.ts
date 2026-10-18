// What the replay is given by the Briefing: the points the line is drawn through (not the empty days before the site
// began), the moments the numbers hold, and today's moments from the day's record. Pure, no hooks.
import type { Bucket, Point, ReportQuery, Site } from '../../lib/api'
import { bucketLabel } from '../../charts/timeScale'
import { firstData } from '../ui/ChartMarks'
import type { ChartIn } from '../ui/DayChart'
import type { ReplayIn } from '../ui/ReplayStage'
import { seriesCaps, type Cap, type CapKind } from './story'
import type { Moment, Topic } from './model'
import type { Replay } from './useReplay'

const KIND: Record<Topic, CapKind> = { sources: 'source', mentions: 'mention', uptime: 'down', sales: 'sale' }

/** A day's moments as the replay tells them: "14:10 · Hacker News starts sending people". */
export function todayCaps(moments: Moment[], end: number): Cap[] {
  if (end <= 0) return []
  return moments.flatMap((m): Cap[] => {
    // A moment that names no topic is not one the record holds.
    if (!m.topic) return []
    const [at, ...rest] = m.txt.split(' · ')
    return [{ pos: Math.min(1, m.min / end), at, line: rest.join(' · '), kind: KIND[m.topic] }]
  })
}

export function replayInOf(o: {
  replay: Replay
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
}): ReplayIn | null {
  const f0 = firstData(o.bucket, o.series.map((x) => x.visitors))
  const series = o.series.slice(f0)
  // A day has something to tell once an hour has passed.
  if (series.length < 3 || o.total <= 0 || (o.today && o.end < 60)) return null
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
  return { replay: o.replay, site: o.site.id, query: o.query, bucket: o.bucket, labels, vals, total: o.total, base, today: o.today, end: o.end, clock: o.clock, period: o.period, source: o.source, money: o.money, onShare: o.onShare }
}
