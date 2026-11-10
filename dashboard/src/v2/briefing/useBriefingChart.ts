// What the chart over the numbers needs, read for the page's own site and period: the report by the hour where the chart
// is cut so, the site's past (its usual), the outages, and the outcome behind the bars and faces. The chart's lines are worked out here.
import { useMemo } from 'react'
import type { Bucket, Point, Report, ReportQuery, Site } from '../../lib/api'
import { todayIn, type CompareMode, type Range } from '../../lib/dates'
import { useNow } from '../../features/incidents/useIncidents'
import type { ChartIn } from '../ui/DayChart'
import { chartOf, siteNow } from './chart'
import { againstName, wholeBefore } from './compare'
import { useUptime, useUsual } from './hooks'
import { moments } from './moments'
import { unitOf } from './model'
import { dayBandOf, hourlyPeople, hourTable, stretchBand, periodBand, usualPeople, verdictOf, type Band } from './usual'
import { useHistory, useHourly, wantsHours } from './useHistory'
import { outcomeChart, useOutcome } from './useOutcome'

export interface BriefingChart {
  chart: ChartIn
  series: Point[]
  bucket: Bucket
  record: { day: string; people: number } | null
  learning: boolean
  low: boolean
  /** Days of history behind the usual. */
  hd: number
  down: boolean
  /** The site's past is read: the usual bands are on the chart. */
  ready: boolean
}

interface ChartRead {
  site: Site
  report: Report
  period: string
  compare: CompareMode
  range: Range
  bucket?: Bucket
  /** The report's question, for the same period cut by the hour. */
  ask: ReportQuery
  notes: { day: string; text: string }[]
  /** Writes an amount in the site's currency; absent where revenue is not shown. */
  money?: (minor: number) => string
  on: boolean
  /** Told against the period before alone: the site's own past is not read (a cut of the site, a shared page). */
  plain?: boolean
}

/** The usual of each bucket: by the hour from the weekly table, by the day from the day totals. */
function bandsOf(series: Point[], table: ReturnType<typeof hourTable>, days: { totals: number[]; days: string[]; long: boolean } | null): (Band | null)[] | undefined {
  if (table) return series.map((p) => stretchBand(table, [{ day: p.t.slice(0, 10), hour: Number(p.t.slice(11, 13)), fr: 1 }]))
  if (!days) return undefined
  return series.map((p) => {
    const i = days.days.indexOf(p.t.slice(0, 10))
    return i < 0 ? null : dayBandOf(days.totals, days.days, i, days.long ? 'long' : 'short')
  })
}

export function useBriefingChart(o: ChartRead): BriefingChart | null {
  const { site, report: page, period, compare, range, bucket, ask, notes, money, on, plain } = o
  const up = useUptime(site, range)
  const nowSec = useNow()
  const today = todayIn(site.timezone)
  const unit = unitOf(period)
  const hours = useHourly(site, range, on && page.bucket !== 'hour' && !bucket && wantsHours(period, range), ask)
  const data = useMemo(() => (hours ? { ...page, bucket: hours.bucket, current: hours.current, previous: hours.previous, previous_series: hours.previous_series } : page), [page, hours]) // the period before comes by the hour too, like the line over it
  const current = data.current
  const cur = useMemo(() => ({ ...current, series: current.series ?? [] }), [current])
  const prev = useMemo(() => (compare === 'none' || !data.previous ? undefined : wholeBefore({ ...data.previous, series: data.previous.series ?? [] }, data.previous_series)), [data.previous, data.previous_series, compare])
  const usual = useUsual(site.id, range.to, on && !plain && (unit === 'today' || unit === 'yesterday'))
  const hist = useHistory(site, today, data.bucket === 'hour', on && !plain)
  const against = compare === 'none' ? undefined : againstName(period, compare, range)
  const hourly = data.bucket === 'hour'
  const downNow = !!site.down_since
  const clock = siteNow(site.timezone, new Date(nowSec * 1000))
  const shownBucket = data.bucket ?? 'day'
  const outcome = useOutcome({ site, range, cur, filters: ask.filters ?? [], bucket: shownBucket, money, on })
  return useMemo(() => {
    if (!on) return null
    const days = (hist.daily ?? []).map((p) => p.t.slice(0, 10))
    const totals = (hist.daily ?? []).map((p) => p.visitors)
    const hd = totals.slice(0, -1).filter((n) => n > 0).length
    const learning = hist.daily ? hd < 7 : false
    const avg = hd ? totals.slice(0, -1).reduce((x, y) => x + y, 0) / Math.max(1, totals.length - 1) : 0
    const low = !!hist.daily && !learning && avg < 20
    const table = hourly && hist.hourly ? hourTable(hist.hourly, today) : null
    const long = cur.series.length > 8
    const bands = bandsOf(cur.series, table, hourly || !hist.daily ? null : { totals, days, long })
    const live = range.to === today
    const nowHour = Number(clock.slice(11, 13)) + Number(clock.slice(14, 16)) / 60
    let whole: Band | null = null
    let wholeHours: { day: string; hour: number; fr: number }[] = []
    if (table) {
      wholeHours = cur.series
        .map((p) => ({ day: p.t.slice(0, 10), hour: Number(p.t.slice(11, 13)) }))
        .filter((h) => !(live && h.day === today && h.hour > nowHour))
        .map((h) => ({ ...h, fr: live && h.day === today ? Math.min(1, Math.max(0, nowHour - h.hour)) : 1 }))
      whole = stretchBand(table, wholeHours)
    } else if (hist.daily && !hourly) {
      // A stretch of days is told against the same number of days before it, not against the sum of each day's own range.
      whole = periodBand(totals, days, range.from, range.to, cur.kpis.visitors, live ? Math.min(1, Math.max(0, nowHour / 24)) : 1)
    }
    // The same figure on the same day has one band: the server's weeks of this weekday, whatever the hour table adds up to.
    const weeks = usual && (unit === 'today' || unit === 'yesterday') ? usual.weeks?.map((w) => w.visitors) ?? [] : []
    const chosen = usualPeople(weeks, whole)
    whole = chosen.band
    const verdict = verdictOf(table && !chosen.byWeeks ? hourlyPeople(cur.series, wholeHours) : cur.kpis.visitors, whole)
    const st = verdict?.st ?? ''
    const downs = up.list.flatMap((x) => {
      const per = hourly ? 3600 : 86400
      const s = (Math.max(x.started_at, up.from0) - up.from0) / per
      const e = ((x.ended_at ?? nowSec) - up.from0) / per
      return e > s ? [{ a: s, b: e, min: Math.round(((x.ended_at ?? nowSec) - x.started_at) / 60), now: x.ended_at === null }] : []
    })
    const marks = notes.flatMap((n) => {
      const first = cur.series.findIndex((p) => p.t.slice(0, 10) === n.day)
      if (first < 0) return []
      const last = cur.series.reduce((k, p, i) => (p.t.slice(0, 10) === n.day ? i : k), first)
      return [{ i: hourly ? Math.min(first + 12, last) : first, text: n.text }]
    })
    const base = chartOf({ cur, prev, against, bucket: shownBucket, unit, nowT: live ? clock : undefined, downs, notes: marks, bands, overall: st })
    const chart = { ...base, ...outcomeChart(outcome, cur.series.map((p) => p.t), money && cur.money ? { currency: cur.money.currency, exponent: cur.money.exponent, write: money } : null) }
    const mo = hist.daily && !learning && !low ? moments({ totals, days, todayUp: unit === 'today' ? st === 'up' : false, from: Math.max(0, days.indexOf(range.from)), to: Math.max(0, days.indexOf(range.to)), elapsed: Math.round(nowHour * 60), today: unit === 'today', week: unit === 'week', filtered: false }) : { pills: [], record: null }
    return { chart, series: cur.series.slice(0, chart.points.length), bucket: shownBucket, record: mo.record, learning, low, hd, down: downNow && !!site.watched_since && !site.uptime_paused, ready: !hist.loading }
  }, [on, cur, prev, against, usual, unit, up.list, up.from0, downNow, site.watched_since, site.uptime_paused, range.to, range.from, shownBucket, nowSec, hist, hourly, today, notes, clock, outcome, money])
}
