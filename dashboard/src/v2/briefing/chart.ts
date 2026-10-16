// The chart's numbers from the report: which points are drawn, where the hours still to come begin, the band, the
// outages and the label over the biggest rise. Pure: chart.test.ts.
import type { Bucket, Point, Result } from '../../lib/api'
import { fmtDay } from '../../lib/dates'
import { copy } from './copy'
import type { ChartIn, Down } from '../ui/DayChart'
import { mult, type Unit } from './model'

const pad = (n: number) => String(n).padStart(2, '0')

/** The site's clock as "2026-10-16T16:30", for a time zone. */
export function siteNow(tz: string, now = new Date()): string {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(now).map((x) => [x.type, x.value]))
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
  } catch {
    return now.toISOString().slice(0, 16)
  }
}

export interface ChartArgs {
  cur: Result
  prev?: Result
  bucket: Bucket
  unit: Unit
  /** The site's clock now, when the period includes it. */
  nowT?: string
  weekday: string
  /** The one source that jumped, for the label over the rise. */
  riseName?: string
  downs?: Down[]
  notes?: { i: number; text: string }[]
}

export function chartOf(a: ChartArgs): ChartIn {
  const hourly = a.bucket === 'hour'
  const live = !!a.nowT && a.cur.series.some((p) => p.t.slice(0, 10) === a.nowT?.slice(0, 10))
  let pts: Point[] = a.cur.series
  let e = 0
  let span = pts.length
  if (live && a.nowT) {
    const nowHour = Number(a.nowT.slice(11, 13))
    e = nowHour + Number(a.nowT.slice(14, 16)) / 60
    pts = pts.filter((p) => p.t.slice(0, 13) <= (a.nowT as string).slice(0, 13))
    if (hourly) span = Math.min(a.cur.series.length, Math.max(6, Math.ceil(e) + 2))
  }
  const was = (a.prev?.series ?? []).map((p) => p.visitors)
  const band = was.length >= pts.length / 2 && pts.length > 1
  const unitWord = hourly ? copy.hours : copy.days
  const points = pts.map((p, i) => {
    const h = Number(p.t.slice(11, 13))
    const fr = live && hourly && i === pts.length - 1 ? Math.min(1, e - h) : 1
    const v = fr >= 0.25 ? Math.round(p.visitors / fr) : p.visitors
    const lo = Math.floor((was[i] ?? 0) * 0.75)
    const hi = Math.ceil((was[i] ?? 0) * 1.25) + 1
    const name = hourly ? `${pad(h)}:00` : fmtDay(p.t.slice(0, 10))
    const tick = hourly ? `${pad(h)}:00` : fmtDay(p.t.slice(0, 10)).replace(/^[A-Za-z]+,? /, '')
    return { i, name, tick, v, lo, hi }
  })
  let best = -1
  let bv = 0
  points.forEach((p, i) => {
    const x = (p.v - p.hi) / Math.max(p.hi, 1)
    if (band && p.v > p.hi && x > bv) {
      bv = x
      best = i
    }
  })
  const ratio = best >= 0 && points[best].lo > 0 ? points[best].v / ((points[best].lo / 0.75 + (points[best].hi - 1) / 1.25) / 2) : 0
  const rise = best >= 0 ? { i: best, text: `${a.riseName ?? copy.traffic} · ${ratio >= 1.3 ? `${mult(ratio)} a usual ${hourly ? 'hour' : 'day'}` : 'above usual'}` } : undefined
  return {
    points,
    span,
    live,
    band,
    usualLabel: a.unit === 'today' || a.unit === 'yesterday' ? copy.usualDay(a.weekday) : copy.usualWord,
    unit: unitWord,
    bucket: a.bucket,
    downs: a.downs ?? [],
    notes: a.notes ?? [],
    rise,
  }
}
