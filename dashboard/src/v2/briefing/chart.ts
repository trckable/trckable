// The chart's numbers from the report: which points are drawn, where the hours still to come begin, the band, the
// outages and the label over the biggest rise. Pure: chart.test.ts.
import type { Bucket, Point, Result } from '../../lib/api'
import { fmtDay } from '../../lib/dates'
import { copy } from './copy'
import type { ChartIn, Down } from '../ui/DayChart'
import { mult, sourceShort, type Unit } from './model'
import { judge, type Band, type Judged } from './usual'

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

/** An axis label: the hour for a day, the weekday at each midnight for longer stretches by the hour, the date for days. */
function tickOf(hourly: boolean, n: number, h: number, date: string, day: string): string {
  if (!hourly) return day.replace(/^[A-Za-z]+,? /, '')
  if (n <= 48) return `${pad(h)}:00`
  return h === 0 ? new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }) : ''
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
  /** The usual band of each bucket of the period, when the site's own history says it (else the period before, a quarter either way). */
  bands?: (Band | null)[]
  /** The whole period against its usual, for the standing note. */
  overall?: Judged
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
  let span = pts.length
  if (live && a.nowT) {
    const nowHour = Number(a.nowT.slice(11, 13)) + Number(a.nowT.slice(14, 16)) / 60
    const key = a.nowT.slice(0, hourly ? 13 : 10)
    const idx = a.cur.series.findIndex((p) => p.t.slice(0, key.length) === key)
    e = (idx < 0 ? 0 : idx) + (hourly ? nowHour - Math.floor(nowHour) : nowHour / 24)
    pts = pts.filter((p) => p.t.slice(0, key.length) <= key)
    // A day is drawn up to the hour after next; a longer stretch shows all of its days.
    if (hourly && a.cur.series.length <= 24) span = Math.min(a.cur.series.length, Math.max(6, Math.ceil(e) + 2))
  }
  const was = (a.prev?.series ?? []).map((p) => p.visitors)
  const band = (a.bands ? a.bands.filter(Boolean).length >= a.cur.series.length / 2 : was.length >= pts.length / 2) && pts.length > 1
  const bandAt = (i: number): Band => a.bands?.[i] ?? bandFrom(was, i)
  const unitWord = hourly ? copy.hours : copy.days
  const points = pts.map((p, i) => {
    const h = Number(p.t.slice(11, 13))
    const fr = live && hourly && i === pts.length - 1 ? Math.min(1, Math.max(0, e - i)) : 1
    const full = bandAt(i)
    const raw = { v: p.visitors, lo: full.lo * fr, hi: full.hi * fr }
    const v = fr >= 0.25 ? Math.round(p.visitors / fr) : p.visitors
    const st: Judged = !band || fr < 0.25 ? '' : judge(p.visitors, { c: full.c * fr, lo: raw.lo, hi: raw.hi })
    const day = fmtDay(p.t.slice(0, 10))
    const days = a.cur.series.length > 24
    const name = hourly ? `${days ? `${day} ` : ''}${pad(h)}:00` : day
    const tick = tickOf(hourly, a.cur.series.length, h, p.t.slice(0, 10), day)
    return { i, name, tick, v, lo: full.lo, hi: full.hi, st, raw }
  })
  const ladder = Array.from({ length: Math.max(span, pts.length) }, (_, i) => bandAt(i))
  let best = -1
  let bv = 0
  points.forEach((p, i) => {
    const x = (p.v - p.hi) / Math.max(p.hi, 1)
    if (p.st === 'up' && x > bv) {
      bv = x
      best = i
    }
  })
  const c0 = best >= 0 ? bandAt(best).c : 0
  const ratio = best >= 0 && c0 > 0.5 ? points[best].v / c0 : 0
  const rise = best >= 0 ? { i: best, text: `${a.riseName ?? copy.traffic} · ${ratio >= 1.3 ? `${mult(ratio)} a usual ${hourly ? 'hour' : 'day'}` : 'above usual'}`, short: `${sourceShort(a.riseName ?? copy.traffic)} ${ratio >= 1.3 ? mult(ratio) : 'up'}` } : undefined
  // The axis names every bucket of the span, the hours still to come too.
  const axis = a.cur.series.slice(0, span).map((p, i) => ({ i, tick: tickOf(hourly, a.cur.series.length, Number(p.t.slice(11, 13)), p.t.slice(0, 10), fmtDay(p.t.slice(0, 10))) }))
  return {
    points,
    axis,
    span,
    live,
    band,
    ladder,
    overall: a.overall ?? '',
    elapsed: live ? e : 0,
    usualLabel: a.unit === 'today' || a.unit === 'yesterday' ? copy.usualDay(a.weekday) : copy.usualWord,
    unit: unitWord,
    bucket: a.bucket,
    downs: a.downs ?? [],
    notes: a.notes ?? [],
    rise,
  }
}
