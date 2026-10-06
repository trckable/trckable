// What Glance shows, worked out from the report it is given and from nothing
// else: the hero, the strip, the eight tiles and the rows behind each. Pure:
// model.test.ts.
import type { Report, Row } from '../../lib/api'
import { addDays } from '../../lib/dates'
import { fmtDuration, fmtInt, fmtPct, countryName } from '../../lib/format'
import { channelColor, channelLabel } from '../../lib/palette'
import { copy } from './copy'
import { alertOf, verdictOf, type Alert, type DayPoint, type TileKey, type Verdict } from './rules'

export interface Seg {
  pct: number
  color: string
}

/** The report's dimension a tile's table is made of, and the filter a row sets. */
export type Dim = 'channel' | 'entry_page' | 'device' | 'country' | 'goal'

export interface TableRow {
  key: string
  label: string
  visitors: number
  /** Share who left after one page, when the row has one. */
  leave?: number
}

export interface TileData {
  key: TileKey
  label: string
  value: string
  tone: 'normal' | 'warn' | 'dim'
  segs: Seg[]
  meaning: string
  /** Goals and Revenue when not set up: the panel offers the setup instead of a table. */
  setup?: 'goal' | 'revenue'
  dim: Dim
  story: string
  rows: TableRow[]
  chart: { name: string; values: number[]; unit: 'n' | 'pct' | 'time' | 'money' }
}

export interface GlanceModel {
  visitors: number
  days: DayPoint[]
  best: DayPoint | null
  verdict: Verdict
  alert: Alert | null
  tiles: TileData[]
  /** The earliest date comparisons can start on, when there is nothing before yet. */
  comparisonsFrom?: string
  empty: boolean
}

export interface ModelIn {
  data: Report
  today: string
  now: number
  money?: (minor: number) => string
  lastEventAt?: number
}

const ACCENT = 'var(--g-accent)'
const WARN = 'var(--g-warn)'
const TRACK = 'var(--g-track)'
const SHADES = ['var(--g-accent)', 'var(--g-accent-2)', 'var(--g-accent-3)', 'var(--g-seg-rest)']

const total = (rows: Row[]) => rows.reduce((a, r) => a + r.visitors, 0)
const byVisitors = (rows: Row[]) => [...rows].sort((a, b) => b.visitors - a.visitors)
const share = (n: number, whole: number) => (whole > 0 ? n / whole : 0)

/** Segments for the shares of the biggest rows, the rest as one grey. */
function shares(rows: Row[], n: number, colors: (r: Row, i: number) => string): Seg[] {
  const all = total(rows)
  if (!all) return []
  const top = byVisitors(rows).slice(0, n)
  const segs = top.map((r, i) => ({ pct: share(r.visitors, all) * 100, color: colors(r, i) }))
  const rest = 100 - segs.reduce((a, s) => a + s.pct, 0)
  return rest > 0.5 ? [...segs, { pct: rest, color: TRACK }] : segs
}

const single = (p: number, color: string): Seg[] => [{ pct: Math.max(0, Math.min(100, p * 100)), color }, { pct: 100 - Math.max(0, Math.min(100, p * 100)), color: TRACK }]

const toRows = (rows: Row[], label: (v: string) => string): TableRow[] =>
  byVisitors(rows).map((r) => ({ key: r.value, label: label(r.value) || copy.none, visitors: r.visitors, leave: r.bounce_rate }))

const pageLabel = (v: string) => v || '/'

export function daysOf(data: Report, today: string): DayPoint[] {
  const s = data.current.series
  return s.map((p, i) => ({ date: p.t, visitors: p.visitors, partial: data.to === today && i === s.length - 1 && s.length > 1 }))
}

/** A chart's values for one tile: per bucket, from what the report carries. */
function chartFor(data: Report, key: TileKey): TileData['chart'] {
  const cur = data.current
  const perDay = cur.days?.length === cur.series.length ? cur.days : undefined
  if (key === 'staying' && perDay) return { name: copy.chartLeave, values: perDay.map((d) => d.kpis.bounce_rate * 100), unit: 'pct' }
  if (key === 'reading' && perDay) return { name: copy.chartTime, values: perDay.map((d) => d.kpis.avg_session_s), unit: 'time' }
  if (key === 'revenue' && cur.series.some((p) => p.revenue)) return { name: copy.chartRevenue, values: cur.series.map((p) => p.revenue ?? 0), unit: 'money' }
  return { name: copy.chartVisitors, values: cur.series.map((p) => p.visitors), unit: 'n' }
}

const carryingValue = (top: Row | undefined, shareOfAll: number) => {
  if (!top) return copy.none
  return shareOfAll > 0.5 ? copy.onePage : pageLabel(top.value)
}

const revenueMeaning = (fmt: ((n: number) => string) | undefined, top: Row | undefined) => {
  if (!fmt) return copy.mRevenueSetup
  return top ? copy.mRevenue(fmt(top.visitors), channelLabel(top.value)) : copy.sRevenue
}

const PHONE = /mobile|phone/i

export function modelOf(i: ModelIn): GlanceModel {
  const { data } = i
  const cur = data.current
  const prev = data.previous && data.previous.kpis.visitors > 0 ? data.previous : undefined
  const k = cur.kpis
  const dims = cur.dims
  const channels = dims.channel ?? []
  const pages = dims.entry_page ?? dims.page ?? []
  const devices = dims.device ?? []
  const countries = dims.country ?? []
  const goals = cur.goals ?? []
  const days = daysOf(data, i.today)
  const allV = total(channels) || k.visitors

  const sources = (r?: { dims: Record<string, Row[] | null> }) => (r?.dims.channel ?? []).map((c) => ({ key: c.value, label: channelLabel(c.value), visitors: c.visitors }))
  const alert = alertOf({
    bounce: k.bounce_rate,
    visitors: k.visitors,
    prevVisitors: prev?.kpis.visitors,
    sources: sources(cur),
    prevSources: prev ? sources(prev) : undefined,
    lastEventAt: i.lastEventAt,
    now: i.now,
    includesToday: data.to === i.today,
  })
  const verdict = verdictOf({ days, visitors: k.visitors, prevVisitors: prev?.kpis.visitors })
  const first = days.find((d) => d.visitors > 0)
  const bounceHigh = k.bounce_rate >= 0.75

  // 1 Where they come from
  const topC = byVisitors(channels)
  const c1 = topC[0]
  const c2 = topC[1]
  const sourceT: TileData = {
    key: 'source',
    label: copy.tSource,
    value: c1 ? channelLabel(c1.value) : copy.none,
    tone: 'normal',
    segs: shares(channels, 3, (r) => channelColor(r.value)),
    meaning: c1 ? copy.mSource(fmtPct(share(c1.visitors, allV)), channelLabel(c1.value), c2 && channelLabel(c2.value), c2 && fmtPct(share(c2.visitors, allV))) : copy.noData,
    dim: 'channel',
    story: c1 ? copy.sSource(channelLabel(c1.value), fmtPct(share(c1.visitors, allV))) : copy.noData,
    rows: toRows(channels, channelLabel),
    chart: chartFor(data, 'source'),
  }
  // 2 Carrying you
  const topP = byVisitors(pages)[0]
  const pageShare = topP ? share(topP.visitors, total(pages) || k.visitors) : 0
  const carrying: TileData = {
    key: 'carrying',
    label: copy.tCarrying,
    value: carryingValue(topP, pageShare),
    tone: 'normal',
    segs: topP ? single(pageShare, ACCENT) : [],
    meaning: topP ? copy.mCarrying(fmtPct(pageShare)) : copy.noData,
    dim: 'entry_page',
    story: topP ? copy.sCarrying(pageLabel(topP.value)) : copy.noData,
    rows: toRows(pages, pageLabel),
    chart: chartFor(data, 'carrying'),
  }
  // 3 Staying
  const staying: TileData = {
    key: 'staying',
    label: copy.tStaying,
    value: copy.leave(fmtPct(k.bounce_rate)),
    tone: bounceHigh ? 'warn' : 'normal',
    segs: single(k.bounce_rate, bounceHigh ? WARN : ACCENT),
    meaning: copy.mStaying(Math.round(k.bounce_rate * 10)),
    dim: 'entry_page',
    story: copy.sStaying,
    rows: toRows(pages, pageLabel),
    chart: chartFor(data, 'staying'),
  }
  // 4 Reading time
  const reading: TileData = {
    key: 'reading',
    label: copy.tReading,
    value: fmtDuration(k.avg_session_s),
    tone: 'normal',
    segs: [],
    meaning: copy.mReading(k.avg_session_s >= 120),
    dim: 'channel',
    story: copy.sReading,
    rows: toRows(channels, channelLabel),
    chart: chartFor(data, 'reading'),
  }
  // 5 Reading on
  const topD = byVisitors(devices)[0]
  const device: TileData = {
    key: 'device',
    label: copy.tDevice,
    value: topD ? topD.value : copy.none,
    tone: 'normal',
    segs: shares(devices, 2, (_r, n) => SHADES[n]),
    meaning: topD ? copy.mDevice(fmtPct(share(topD.visitors, total(devices))), PHONE.test(topD.value)) : copy.noData,
    dim: 'device',
    story: copy.sDevice,
    rows: toRows(devices, (v) => v),
    chart: chartFor(data, 'device'),
  }
  // 6 Where they are
  const topK = byVisitors(countries)
  const country: TileData = {
    key: 'country',
    label: copy.tCountry,
    value: topK[0] ? countryName(topK[0].value) : copy.none,
    tone: 'normal',
    segs: shares(countries, 3, (_r, n) => SHADES[n]),
    meaning: topK[0] ? copy.mCountry(fmtPct(share(topK[0].visitors, total(countries))), topK[1] && countryName(topK[1].value), topK[2] && countryName(topK[2].value)) : copy.noData,
    dim: 'country',
    story: copy.sCountry,
    rows: toRows(countries, countryName),
    chart: chartFor(data, 'country'),
  }
  // 7 Goals
  const topG = byVisitors(goals)[0]
  const goalT: TileData = {
    key: 'goals',
    label: copy.tGoals,
    value: topG ? topG.value : copy.notSet,
    tone: topG ? 'normal' : 'dim',
    segs: [],
    meaning: topG ? copy.mGoals(fmtInt(topG.visitors), topG.value) : copy.mGoalsSetup,
    setup: topG ? undefined : 'goal',
    dim: 'goal',
    story: topG ? copy.sGoals(topG.value) : copy.setupGoalBody,
    rows: toRows(goals, (v) => v),
    chart: chartFor(data, 'goals'),
  }
  // 8 Revenue
  const m = cur.money
  const payers = byVisitors((cur.revenue_dims?.channel ?? []).map((r) => ({ ...r, visitors: r.revenue ?? 0 })))
  const money = i.money && m && m.payments > 0
  const revenue: TileData = {
    key: 'revenue',
    label: copy.tRevenue,
    value: money && i.money ? i.money(m.revenue) : copy.notCounted,
    tone: money ? 'normal' : 'dim',
    segs: [],
    meaning: revenueMeaning(money ? i.money : undefined, payers[0]),
    setup: money ? undefined : 'revenue',
    dim: 'channel',
    story: money ? copy.sRevenue : copy.setupRevenueBody,
    rows: toRows(channels, channelLabel),
    chart: chartFor(data, 'revenue'),
  }

  return {
    visitors: k.visitors,
    days,
    best: days.filter((d) => !d.partial).reduce<DayPoint | null>((a, d) => (!a || d.visitors > a.visitors ? d : a), null),
    verdict,
    alert,
    tiles: [sourceT, carrying, staying, reading, device, country, goalT, revenue],
    comparisonsFrom: prev || !first ? undefined : addDays(first.date.slice(0, 10), days.length),
    empty: k.visitors === 0,
  }
}
