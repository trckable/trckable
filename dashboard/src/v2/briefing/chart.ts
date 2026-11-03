// The chart's numbers from the report: which points are drawn, where the hours still to come begin, the band, the
// outages and the label over the biggest rise. Pure: chart.test.ts.
import type { Bucket, Point, Result } from '../../lib/api'
import { tag } from '../../i18n'
import { fmtDay } from '../../lib/dates'
import { copy } from './copy'
import type { ChartIn, Down } from '../ui/DayChart'
import type { Unit } from './model'
import { judge, type Band, type Judged } from './usual'
import { dateFmt } from '../../lib/format'
import { compareOf, learnOf, pairAt, sameGrain, startsOn } from './compare'

const pad = (n: number) => String(n).padStart(2, '0')

/** The site's clock as "2026-10-16T16:30", for a time zone. */
export function siteNow(tz: string, now = new Date()): string {
  try {
    const p = Object.fromEntries(dateFmt('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(now).map((x) => [x.type, x.value]))
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
  } catch {
    return now.toISOString().slice(0, 16)
  }
}

/** An axis label: the hour for a day, the weekday at each midnight for longer stretches by the hour, the date for days. */
function tickOf(hourly: boolean, n: number, h: number, date: string): string {
  if (!hourly) return String(Number(date.slice(8, 10)))
  if (n <= 48) return `${pad(h)}:00`
  return h === 0 ? dateFmt(tag ?? 'en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z')) : ''
}

interface ChartArgs {
  cur: Result
  prev?: Result
  bucket: Bucket
  unit: Unit
  /** The site's clock now, when the period includes it. */
  nowT?: string
  downs?: Down[]
  notes?: { i: number; text: string }[]
  /** The usual band of each bucket of the period, when the site's own history says it (else the period before, a quarter either way). */
  bands?: (Band | null)[]
  /** What the period before is called ("last month"): the dashed line and the line over the chart. Absent: no comparison is asked for. */
  against?: string
  /** The whole period against its usual, for the standing note. */
  overall?: Judged
  /** Sales to mark on the line, with when each was (the site's clock) and what it came to as written. */
  sales?: { at: string; text: string; neg?: boolean; size: number }[]
}

/** A bucket's time as the axis writes it: the weekday and hour for a long hourly chart, the hour for a day, the date for days. */
function whenOf(series: Point[], i: number, hourly: boolean): string {
  const t = series[i].t
  if (!hourly) return fmtDay(t.slice(0, 10))
  if (series.length <= 24) return t.slice(11, 16)
  return `${dateFmt(tag ?? 'en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(t.slice(0, 10) + 'T12:00:00Z'))} ${t.slice(11, 16)}`
}

/**
 * Where the run that is outside its usual right now began, for the pill. A site that is down says when the outage began.
 * Otherwise it is the first bucket of the last stretch of the same verdict that reaches the end (a bucket barely begun
 * does not count): buckets with no verdict because the usual there is next to nothing (night hours) do not break it, a
 * bucket of the other verdict or one back inside a real usual does. A period that is over and ends inside its usual has
 * the point of its biggest rise instead.
 */
export function startOf(points: ChartIn['points'], hourly: boolean, live: boolean, e: number, series: Point[], downs: Down[] = []): ChartIn['started'] {
  const out = downs.find((d) => d.now)
  if (out) {
    const i = Math.min(Math.max(0, Math.floor(out.a)), series.length - 1)
    return { i, when: whenOf(series, i, hourly), dir: 'dn', down: true }
  }
  const n = points.length - 1
  const end = live && hourly && e - n < 0.25 ? n - 1 : n
  const dir = points[end]?.st
  if (!dir) {
    const i = live ? -1 : biggestRise(points)
    return i < 0 ? undefined : { i, when: whenOf(series, i, hourly), dir: 'up' }
  }
  let i = end
  for (let k = end - 1; k >= 0; k--) {
    const p = points[k]
    if (p.st === dir) i = k
    else if (p.st || p.hi >= 1) break
  }
  return { i, when: whenOf(series, i, hourly), dir }
}

/** The bucket furthest above its usual, as a share of it; -1 when none is above. */
function biggestRise(points: ChartIn['points']): number {
  let best = -1
  let bv = 0
  points.forEach((p, i) => {
    const x = (p.v - p.hi) / Math.max(p.hi, 1)
    if (p.st === 'up' && x > bv) {
      bv = x
      best = i
    }
  })
  return best
}

const bandFrom = (was: number[], i: number): Band => {
  const c = was[i] ?? 0
  return { c, lo: Math.floor(c * 0.75), hi: Math.ceil(c * 1.25) + 1 }
}

export function chartOf(a: ChartArgs): ChartIn {
  const hourly = a.bucket === 'hour'
  const nowDay = a.nowT?.slice(0, 10)
  const live = !!a.nowT && a.cur.series.some((p) => p.t.slice(0, 10) === nowDay)
  let pts: Point[] = a.cur.series
  let e = 0
  // A day is drawn whole: its axis runs to the end of the site's day, the hours still to come shaded (a site whose clock
  // is at 00:12 would otherwise show a chart that ends at 05:00). A longer stretch shows all of its buckets too.
  const span = a.cur.series.length
  if (live && a.nowT) {
    const nowHour = Number(a.nowT.slice(11, 13)) + Number(a.nowT.slice(14, 16)) / 60
    const key = a.nowT.slice(0, hourly ? 13 : 10)
    const idx = a.cur.series.findIndex((p) => p.t.slice(0, key.length) === key)
    e = (idx < 0 ? 0 : idx) + (hourly ? nowHour - Math.floor(nowHour) : nowHour / 24)
    pts = pts.filter((p) => p.t.slice(0, key.length) <= key)
  }
  const was = sameGrain(a.cur.series, a.prev?.series) ? (a.prev?.series ?? []).map((p) => p.visitors) : []
  const band = (a.bands ? a.bands.filter(Boolean).length >= a.cur.series.length / 2 : was.length >= pts.length / 2) && pts.length > 1
  const bandAt = (i: number): Band => a.bands?.[i] ?? bandFrom(was, i)
  const unitWord = hourly ? copy.hours : copy.days
  // The buckets that are over count in the change over the chart; the one still going does not.
  const done = live && pts.length > 1 ? pts.length - 1 : pts.length
  const cmp = a.against ? compareOf(a.cur.series, a.prev?.series, done, a.against) : null
  const points = pts.map((p, i) => {
    const h = Number(p.t.slice(11, 13))
    const fr = live && hourly && i === pts.length - 1 ? Math.min(1, Math.max(0, e - i)) : 1
    const full = bandAt(i)
    const sofar = { lo: full.lo * fr, hi: full.hi * fr }
    const v = fr >= 0.25 ? Math.round(p.visitors / fr) : p.visitors
    const st: Judged = !band || fr < 0.25 ? '' : judge(p.visitors, { c: full.c * fr, ...sofar })
    const day = fmtDay(p.t.slice(0, 10))
    const days = a.cur.series.length > 24
    const name = hourly ? `${days ? `${day} ` : ''}${pad(h)}:00` : day
    const tick = tickOf(hourly, a.cur.series.length, h, p.t.slice(0, 10))
    // The same bucket of the period before, as the report has it; a bucket still going has no change to tell yet.
    const { was: before, delta } = pairAt(cmp, p.visitors, i, done)
    return { i, name, tick, v, lo: full.lo, hi: full.hi, st, raw: p.visitors, was: before, delta }
  })
  const started = startOf(points, hourly, live, e, a.cur.series, a.downs)
  // The axis names every bucket of the period, the hours still to come too (a phone draws the whole day).
  const axis = a.cur.series.map((p, i) => ({ i, tick: tickOf(hourly, a.cur.series.length, Number(p.t.slice(11, 13)), p.t.slice(0, 10)) }))
  // A sale sits where it happened on the hours of the day, when the chart is by the hour and short enough to read them.
  const sales =
    hourly && a.cur.series.length <= 48
      ? (a.sales ?? [])
          .flatMap((x) => {
            const i = a.cur.series.findIndex((p) => p.t.slice(0, 13) === x.at.slice(0, 13))
            return i < 0 ? [] : [{ at: i + Number(x.at.slice(14, 16)) / 60, text: x.text, neg: x.neg, size: x.size }]
          })
          .sort((p, q) => q.size - p.size)
          .map(({ at, text, neg }) => ({ at, text, neg }))
      : []
  // A comparison that is asked for but has too little before it says when it begins, never a made-up line.
  const starts = a.against && a.prev && !cmp ? startsOn(a.cur.series, a.prev.series) : null
  const noCompare = starts ? copy.compareStarts(starts, copy.needs[a.unit]) : null
  return {
    points,
    axis,
    full: a.cur.series.length,
    sales,
    span,
    live,
    band,
    usual: a.cur.series.map((_, i) => (a.bands ? a.bands[i] ?? null : bandFrom(was, i))).map((b) => (b ? { lo: b.lo, hi: b.hi } : null)),
    compare: cmp,
    noCompare,
    startsOn: starts,
    learn: starts && !hourly ? learnOf(a.cur.series, a.prev?.series) : null,
    overall: a.overall ?? '',
    elapsed: live ? e : 0,
    unit: unitWord,
    bucket: a.bucket,
    downs: a.downs ?? [],
    notes: a.notes ?? [],
    started,
  }
}
