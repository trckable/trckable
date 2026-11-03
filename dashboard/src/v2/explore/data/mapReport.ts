// The report's answer, said as Explore's overview and tables. Pure: mapReport.test.ts.
import type { KPIs, Report, Result, Row as ApiRow, ScrollReport } from '../../../lib/api'
import { fmtDay, type ISODate } from '../../../lib/dates'
import { countryName, fmtDuration, fmtFixed, fmtInt, fmtPct, languageName, zoneName } from '../../../lib/format'
import { plainSpan } from '../../../lib/plainSpan'
import { channelLabel } from '../../../lib/palette'
import { baseEnough, tooFew } from '../../../lib/thin'
import { compareOf, whyNot } from '../../briefing/compare'
import { sourceName } from '../../briefing/model'
import { copy } from '../copy'
import type { Down, FilterDim, Kc, Option, Overview, Row, Shape, Stat, Tab, Table, Top, Xkc } from '../types'
import type { Basis } from './basis'
import { changeOf, noteOf, rowsOf, statOf } from './stats'

/** What the uptime card needs: the share of the period the site answered, and the incidents of the period. */
export interface Uptime {
  /** Null while the site is not watched, or watched for too short a time to say. */
  pct: number | null
  down: Down[]
  lost: number
}

const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase())
const host = (v: string) => v.replace(/^www\./, '')

function perOf(bucket: Report['bucket'], points: number): string {
  if (bucket === 'hour') return points > 48 ? copy.sixHours : copy.hour
  return bucket
}

function shapeOf(r: Report, now: ISODate, against?: string): Shape | null {
  const pts = (r.current.series ?? []).map((p) => p.visitors)
  if (pts.length < 2) return null
  const name = (i: number) => {
    const t = r.current.series[i].t
    return r.bucket === 'hour' ? `${fmtDay(t.slice(0, 10))} ${t.slice(11, 16)}` : fmtDay(t.slice(0, 10))
  }
  const label = (i: number) => {
    const t = r.current.series[i].t
    return r.bucket === 'hour' ? t.slice(11, 16) : fmtDay(t.slice(0, 10))
  }
  const last = r.to === now && r.bucket === 'hour' ? copy.now : label(pts.length - 1)
  const before = against ? compareOf(r.current.series ?? [], r.previous?.series, pts.length, against) : null
  return { pts, x: [label(0), label(Math.floor(pts.length / 2)), last], names: pts.map((_, i) => name(i)), before, why: against && !before ? whyNot(r.current.series ?? [], r.previous?.series) : null }
}

/** The overview's four cards: people, a goal (or views), money (or uptime), and who left after one page. */
export function mapOverview(r: Report, o: { money?: (minor: number) => string; uptime: Uptime | null; now: ISODate; basis?: Basis; against?: string }): Overview {
  const cur = r.current
  const prev = r.previous
  const base = !!prev && baseEnough(prev.kpis.visitors)
  const pe = (s: Stat): Kc['note'] => noteOf(s, copy.vs[o.basis ?? 'usual'], o.basis && o.basis !== 'usual' ? copy.asBefore : copy.asUsual, '')
  const people = statOf(cur.kpis.visitors, prev?.kpis.visitors, base)
  const goal = (cur.goals ?? []).find((g) => g.visitors > 0)
  const gs = goal ? statOf(goal.visitors, prev?.goals?.find((g) => g.value === goal.value)?.visitors, base) : null
  const views = statOf(cur.kpis.pageviews, prev?.kpis.pageviews, base)
  const series = cur.series ?? []
  const kcs: Kc[] = [
    { icon: 'people', label: copy.people, val: fmtInt(people.v), note: pe(people), vals: series.map((p) => p.visitors), st: people.st === 'dn' ? 'dn' : '' },
    goal && gs
      ? { icon: 'goal', label: cap(goal.label || goal.value), val: fmtInt(goal.visitors), note: pe(gs), vals: [], share: people.v ? goal.visitors / people.v : 0, col: 'var(--mk-blue)', st: gs.st === 'dn' ? 'dn' : '' }
      : { icon: 'click', label: copy.kc.views, val: fmtInt(views.v), note: pe(views), vals: series.map((p) => p.pageviews), col: 'var(--mk-blue)', st: views.st === 'dn' ? 'dn' : '' },
  ]
  if (cur.money && o.money) {
    const m = statOf(cur.money.revenue, prev?.money?.revenue, base)
    kcs.push({ icon: 'money', label: copy.kc.money, val: o.money(cur.money.revenue), unit: copy.net, note: pe(m), vals: series.map((p) => p.revenue ?? 0), st: m.st === 'dn' ? 'dn' : '' })
  } else kcs.push(uptimeKc(o.uptime))
  const worse = !tooFew(cur.kpis.sessions) && base && cur.kpis.bounce_rate > (prev?.kpis.bounce_rate ?? 1) + 0.04
  kcs.push({
    icon: 'leave',
    label: copy.kc.leave,
    val: tooFew(cur.kpis.sessions) ? '–' : fmtPct(cur.kpis.bounce_rate),
    note: { c: worse ? 'dn' : '', t: worse ? copy.higher : copy.asUsual },
    vals: series.flatMap((p) => (p.bounce_rate === undefined ? [] : [p.bounce_rate])),
    lo: 0,
    hi: 0.8,
    col: 'var(--mk-blue)',
    st: worse ? 'dn' : '',
  })
  const rows = (dim: string, name: (v: string) => string) => rowsOf(cur.dims[dim], prev?.dims[dim], prev?.kpis.visitors, name)
  return {
    kcs,
    per: perOf(r.bucket, series.length),
    shape: shapeOf(r, o.now, o.against),
    down: o.uptime?.down ?? [],
    pages: rows('page', (v) => v),
    // The channels, as the Sources tab lists them: a direct visit has no referrer, so a list of referrers would leave it out.
    sources: rows('channel', channelLabel),
    of: cur.kpis.visitors,
  }
}

function uptimeKc(u: Uptime | null): Kc {
  const down = (u?.lost ?? 0) > 0
  let note = copy.noDowntime
  if (down) note = copy.downFor(plainSpan(u?.lost ?? 0))
  if (u === null || u.pct === null) note = copy.checksOff
  return {
    icon: 'uptime',
    label: copy.kc.uptime,
    val: u?.pct == null ? '–' : `${fmtFixed(u.pct, 2)}%`,
    note: { c: down ? 'dn' : '', t: note },
    // The incident record has no curve to draw: a line of made-up points would pass for one.
    vals: [],
    st: down ? 'dn' : '',
  }
}

interface TableCfg {
  /** The report's dimension the rows come from. */
  key: string
  /** The filter a tapped row sets (none: the rows only read). */
  dim?: string
  name: (v: string) => string
  code?: boolean
}

const TABLES: Partial<Record<Tab, TableCfg>> = {
  pages: { key: 'page', dim: 'page', name: (v) => v },
  sources: { key: 'channel', dim: 'channel', name: channelLabel },
  referrers: { key: 'referrer', dim: 'referrer', name: (v) => host(v) || copy.direct },
  utm: { key: 'campaign', dim: 'campaign', name: (v) => v },
  countries: { key: 'country', dim: 'country', name: countryName, code: true },
  devices: { key: 'device', dim: 'device', name: (v) => v },
  browsers: { key: 'browser', name: (v) => v },
  exits: { key: 'exit_page', dim: 'exit_page', name: (v) => v },
  groups: { key: 'group', dim: 'group', name: (v) => v },
  regions: { key: 'region', dim: 'region', name: (v) => v },
  cities: { key: 'city', dim: 'city', name: (v) => v },
  utmsource: { key: 'source', dim: 'source', name: (v) => v },
  medium: { key: 'medium', dim: 'medium', name: (v) => v },
  bversion: { key: 'browser_version', dim: 'browser_version', name: (v) => v },
  screens: { key: 'screen', dim: 'screen', name: (v) => v },
  languages: { key: 'language', dim: 'language', name: languageName },
  timezones: { key: 'timezone', dim: 'timezone', name: zoneName },
}

/** A visit has one entry page but many pages and sections, and a sale belongs to the visit: nothing to attribute to those. */
const NO_SALE = new Set(['page', 'group', 'exit_page', 'hostname'])

/** Signups are counted for the visit's own dimensions; a page or a section is not one. */
const NO_SIGNUP = new Set(['page', 'group', 'hostname'])

/** A table of people for one tab: the dimension's rows against the period before, each said in its own words. */
export function mapTable(tab: Tab, r: Report): Table {
  const t = TABLES[tab]
  if (!t) return { rows: [], of: r.current.kpis.visitors }
  // Only the breakdowns the server attributes sales to carry them (not regions, cities, languages, screens...): a column of zeros there would say nobody paid.
  const attributed = (r.current.dims[t.key] ?? []).some((x) => x.revenue !== undefined) || !!r.current.revenue_dims?.[t.key]
  const sales = !!r.current.money && !NO_SALE.has(t.key) && attributed
  // The rows carry what they earned; the top list covers a row the report left without it.
  const paid = new Map<string, ApiRow>()
  if (sales) {
    for (const x of r.current.revenue_dims?.[t.key] ?? []) paid.set(x.value, x)
    for (const x of r.current.dims[t.key] ?? []) if (x.revenue !== undefined) paid.set(x.value, x)
  }
  const signups = !!r.current.signup && !NO_SIGNUP.has(t.key)
  const joined = new Map((r.current.dims[t.key] ?? []).map((x) => [x.value, x.signups ?? 0]))
  const extra = (v: string): Partial<Row> => ({
    ...(t.code ? { code: v } : {}),
    ...(signups ? { su: joined.get(v) ?? 0 } : {}),
    ...(sales ? { cust: paid.get(v)?.customers ?? 0, rev: paid.get(v)?.revenue ?? 0 } : {}),
  })
  const rows = rowsOf(r.current.dims[t.key], r.previous?.dims[t.key], r.previous?.kpis.visitors, t.name, extra)
  return { rows, dim: t.dim, of: r.current.kpis.visitors }
}

const OPTION_DIMS: Record<FilterDim, { dim: string; name: (v: string) => string }> = {
  referrer: { dim: 'referrer', name: (v) => sourceName(v) || host(v) },
  page: { dim: 'page', name: (v) => v },
  country: { dim: 'country', name: countryName },
  device: { dim: 'device', name: (v) => v },
}

/** The values a filter can take, from what the period saw. */
export function optionsOf(cur: Result): Partial<Record<FilterDim, Option[]>> {
  const out: Partial<Record<FilterDim, Option[]>> = {}
  for (const [k, o] of Object.entries(OPTION_DIMS) as [FilterDim, (typeof OPTION_DIMS)[FilterDim]][]) {
    const rows: ApiRow[] = cur.dims[o.dim] ?? []
    out[k] = rows.filter((r) => r.visitors > 0).map((r) => ({ val: r.value, name: o.name(r.value) }))
  }
  return out
}

/** The device, browser and system most people used: each one's share of the period's people. */
export function mapTops(r: Report): Top[] {
  const people = r.current.kpis.visitors
  return (['device', 'browser', 'os'] as const).flatMap((dim) => {
    const top = (r.current.dims[dim] ?? []).reduce<ApiRow | null>((best, x) => (x.visitors > (best?.visitors ?? 0) ? x : best), null)
    return top && people > 0 ? [{ dim, val: top.value, share: top.visitors / people }] : []
  })
}

/** Reading depth in whole percents (the report writes a share as 0 to 1 or 0 to 100). */
const depthOf = (x: number) => Math.round(x <= 1 ? x * 100 : x)

/** How people read the pages: five numbers, each against the period before. A number the period could not measure says a dash. */
export function mapEngage(now: { kpis: KPIs; scroll?: ScrollReport }, before?: { kpis: KPIs; scroll?: ScrollReport }): Xkc[] {
  const read = (s?: ScrollReport) => (s && s.samples > 0 ? { avg: Math.round(s.avg), deep: depthOf(s.reached[2]) } : undefined)
  const engaged = (k: KPIs) => Math.round(k.sessions * (1 - k.bounce_rate))
  const [a, b] = [read(now.scroll), before && read(before.scroll)]
  const card = (icon: string, label: string, val: string, cur: number | undefined, was: number | undefined, wasText: string): Xkc =>
    cur === undefined ? { icon, label, val: '–', tag: '', tone: '', detail: '' } : { icon, label, val, ...changeOf(cur, was, copy.asUsual), detail: was ? copy.was(wasText) : '' }
  const k = [now.kpis, before?.kpis] as const
  return [
    card('pages', copy.engage.scroll, `${a?.avg}%`, a?.avg, b?.avg, `${b?.avg}%`),
    card('uptime', copy.engage.time, fmtDuration(k[0].avg_session_s), k[0].sessions > 0 ? k[0].avg_session_s : undefined, k[1]?.avg_session_s, fmtDuration(k[1]?.avg_session_s ?? 0)),
    card('goal', copy.engage.deep, `${a?.deep}%`, a?.deep, b?.deep, `${b?.deep}%`),
    card('people', copy.engage.engaged, fmtInt(engaged(k[0])), k[0].sessions > 0 ? engaged(k[0]) : undefined, k[1] && engaged(k[1]), fmtInt(k[1] ? engaged(k[1]) : 0)),
    card('click', copy.engage.perVisit, fmtFixed(k[0].views_per_session, 1), k[0].sessions > 0 ? k[0].views_per_session : undefined, k[1]?.views_per_session, fmtFixed(k[1]?.views_per_session ?? 0, 1)),
  ]
}
