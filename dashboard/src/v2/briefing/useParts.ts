// Everything the Briefing works out from the report and the site's past, in one place: whether the site is still
// learning its normal, the usual of every bucket, the scores, the sentence, the chart and the hero's pills.
import { useMemo } from 'react'
import { tag } from '../../i18n'
import type { Point, Result, Site } from '../../lib/api'
import type { Range } from '../../lib/dates'
import { chartOf, siteNow } from './chart'
import { copy } from './copy'
import { cardsOf, leadSource, type UptimeIn } from './cards'
import { moments } from './moments'
import type { Extras } from './useExtras'
import type { SliceData } from './useSlices'
import { engagementFromBounce, sourceName, engagementScore, sentence, trafficFromBand, trafficScore, uptimeScore, type Score, type Unit, type Usual } from './model'
import { dayBandOf, hourTable, judge, stretchBand, usualBounce, type Band } from './usual'
import type { History } from './useHistory'

const weekdayOf = (day: string) => new Date(day + 'T12:00:00Z').toLocaleDateString(tag ?? 'en-US', { weekday: 'long', timeZone: 'UTC' })

export interface PartsIn {
  site: Site
  cur: Result | undefined
  prev: Result | undefined
  usual: Usual | null
  unit: Unit
  range: Range
  today: string
  bucket: 'hour' | 'day' | 'week' | 'month' | undefined
  hist: History
  up: { pct: number | null; list: { started_at: number; ended_at: number | null; expected_visits: number | null }[]; from0: number }
  downMin: number
  nowSec: number
  notes: { day: string; text: string }[]
  slices: SliceData
  extras: Extras
  /** The replay's "now", as minutes into today; the clock itself when absent. */
  clockAt?: number
}

const usualWordsOf = (unit: Unit, weekday: string, at: string): string => {
  if (unit === 'today') return copy.usualByNow(weekday, at)
  return unit === 'yesterday' ? copy.usualDay1(weekday) : copy.usualBare
}

const mentionHost = (m: { source: string; host: string }): string => {
  if (m.source === 'hn') return 'Hacker News'
  return m.source === 'ph' ? 'Product Hunt' : m.host
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

export function useParts(a: PartsIn) {
  const { site, cur, prev, usual, unit, range, today, bucket, hist, up, downMin, nowSec, notes, slices, extras, clockAt } = a
  const hourly = bucket === 'hour'
  const downNow = !!site.down_since
  const clock = clockAt === undefined ? siteNow(site.timezone, new Date(nowSec * 1000)) : `${today}T${String(Math.floor(clockAt / 60)).padStart(2, '0')}:${String(clockAt % 60).padStart(2, '0')}`
  return useMemo(() => {
    if (!cur) return null
    const days = (hist.daily ?? []).map((p) => p.t.slice(0, 10))
    const totals = (hist.daily ?? []).map((p) => p.visitors)
    const hd = totals.slice(0, -1).filter((n) => n > 0).length
    const learning = hist.daily ? hd < 7 : false
    const avg = hd ? totals.slice(0, -1).reduce((x, y) => x + y, 0) / Math.max(1, totals.length - 1) : 0
    const low = !!hist.daily && !learning && avg < 20
    const weekday = weekdayOf(range.to)
    const uptime = uptimeScore({ pct: up.pct, downNow, downMin, off: !site.watched_since })
    const table = hourly && hist.hourly ? hourTable(hist.hourly, today) : null
    const long = cur.series.length > 8
    const bands = bandsOf(cur.series, table, hourly || !hist.daily ? null : { totals, days, long })
    const live = range.to === today
    const nowHour = Number(clock.slice(11, 13)) + Number(clock.slice(14, 16)) / 60
    let whole: Band | null = null
    if (table) {
      const hours = cur.series
        .map((p) => ({ day: p.t.slice(0, 10), hour: Number(p.t.slice(11, 13)) }))
        .filter((h) => !(live && h.day === today && h.hour > nowHour))
        .map((h) => ({ ...h, fr: live && h.day === today ? Math.min(1, Math.max(0, nowHour - h.hour)) : 1 }))
      whole = stretchBand(table, hours)
    } else if (bands) {
      const ok = bands.filter((b): b is Band => !!b)
      if (ok.length) {
        const c = ok.reduce((x, b) => x + b.c, 0)
        const m = Math.sqrt(ok.reduce((x, b) => x + ((b.hi - b.lo) / 2) ** 2, 0))
        whole = { c, lo: Math.max(0, c - m), hi: c + m }
      }
    }
    const v = cur.kpis.visitors
    const st = whole ? judge(v, whole) : ''
    const bounceUsual = hist.daily ? usualBounce(hist.daily, today, unit === 'today' || unit === 'yesterday' ? new Date(range.to + 'T12:00:00Z').getUTCDay() : null) : null
    const scored: Score[] = [
      whole && !learning ? trafficFromBand(v, whole) : trafficScore(cur, prev),
      bounceUsual !== null && !learning ? engagementFromBounce(cur.kpis.bounce_rate, bounceUsual, cur.kpis.sessions) : engagementScore(cur, prev),
      uptime,
    ]
    const scores: Score[] = downNow ? scored.map((x) => (x.key === 'uptime' ? x : { ...x, value: null, verdict: 'none', words: copy.unknownDown })) : scored
    const clockOf = (t: number) => siteNow(site.timezone, new Date(t * 1000)).slice(11)
    const periodEnd = Math.max(up.from0 + 1, Math.min(up.from0 + (live ? 86400 : 86400 * Math.max(1, days.indexOf(range.to) - days.indexOf(range.from) + 1)), up.from0 + 86400 * 400))
    const uptimeIn: UptimeIn = {
      downNow,
      since: site.down_since ? clockOf(site.down_since) : '',
      cause: site.down_cause,
      minutesNow: site.down_since ? Math.round((nowSec - site.down_since) / 60) : 0,
      incidents: up.list.map((x) => ({ from: clockOf(x.started_at), to: clockOf(x.ended_at ?? nowSec) })),
      minutes: downMin,
      lost: up.list.reduce((x, y) => x + (y.expected_visits ?? 0), 0),
      a: up.list.length ? Math.max(0, (Math.min(...up.list.map((x) => x.started_at)) - up.from0) / (periodEnd - up.from0)) : 0,
      nowAt: Math.min(1, Math.max(0, (nowSec - up.from0) / (periodEnd - up.from0))),
      b: up.list.length ? Math.min(1, (Math.max(...up.list.map((x) => x.ended_at ?? nowSec)) - up.from0) / (periodEnd - up.from0)) : 0,
      now: clockOf(nowSec),
    }
    const rule = usual && (unit === 'today' || unit === 'yesterday') ? copy.weekdayRule(weekday, '') : copy.periodRule
    const mention = extras.mention
    const stories = cardsOf({
      domain: site.domain,
      cur,
      prev,
      unit,
      weekday,
      learning,
      low,
      slices: slices.slices,
      topPageOf: (v) => (slices.topPage?.for === v ? { name: slices.topPage.name, value: slices.topPage.value } : undefined),
      topSourceOf: (v) => (slices.topSource?.for === v ? slices.topSource.name : undefined),
      rule,
      uptime: uptimeIn,
      mention: mention && unit === 'today' ? { host: mentionHost(mention), title: mention.title, at: clockOf(mention.posted_at), points: mention.points ?? 0, comments: mention.comments ?? 0, page: cur.dims.entry_page?.[0]?.value ?? '/' } : undefined,
      speed: extras.speed ?? undefined,
    })
    const lead = learning ? undefined : leadSource(slices.slices.referrer, cur.kpis.visitors, site.domain)
    const jump = lead?.st === 'up' && lead.band ? { name: sourceName(lead.value), value: lead.value, visitors: lead.v, times: lead.band.c > 0.5 ? lead.v / lead.band.c : null, vs: unit === 'today' || unit === 'yesterday' ? 'your usual' : undefined } : null
    const usualWords = usualWordsOf(unit, weekday, clock.slice(11))
    const say = sentence({ cur, prev, usual, unit, weekday, self: site.domain, downMin, learning, jump, band: whole && !learning ? { ratio: whole.c > 0.5 ? v / whole.c : null, st, words: usualWords } : null })
    const top = jump
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
    const chart = chartOf({ cur, prev, bucket: bucket ?? 'day', unit, nowT: live ? clock : undefined, weekday, riseName: top?.times && top.times >= 1.5 ? top.name : undefined, downs, notes: marks, bands, overall: st })
    const mo =
      hist.daily && !learning && !low
        ? moments({ totals, days, todayUp: unit === 'today' ? st === 'up' : false, from: Math.max(0, days.indexOf(range.from)), to: Math.max(0, days.indexOf(range.to)), elapsed: Math.round(nowHour * 60), today: unit === 'today', week: unit === 'week', filtered: false })
        : { pills: [], line: '' }
    return { hhmm: clock.slice(11), learning, hd, low, uptime, scores, stories, say, top, chart, weekday, whole, st, bounceUsual, mo }
  }, [cur, prev, usual, unit, up.pct, up.list, up.from0, downNow, downMin, site.domain, site.down_since, site.down_cause, site.timezone, site.watched_since, range.to, range.from, bucket, nowSec, hist, hourly, today, notes, clock, slices, extras])
}
