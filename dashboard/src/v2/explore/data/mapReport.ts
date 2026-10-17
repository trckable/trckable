// The report's answer, said as Explore's overview and tables. Pure: mapReport.test.ts.
import type { Report, Result, Row as ApiRow } from '../../../lib/api'
import { fmtDay, type ISODate } from '../../../lib/dates'
import { countryName, fmtFixed, fmtInt, fmtPct } from '../../../lib/format'
import { channelLabel } from '../../../lib/palette'
import { baseEnough, tooFew } from '../../../lib/thin'
import { sourceName } from '../../briefing/model'
import { copy } from '../copy'
import type { Down, FilterDim, Kc, Option, Overview, Row, Shape, Stat, Tab, Table } from '../types'
import type { Basis } from './basis'
import { noteOf, rowsOf, statOf } from './stats'

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

function shapeOf(r: Report, now: ISODate): Shape | null {
  const pts = (r.current.series ?? []).map((p) => p.visitors)
  if (pts.length < 2) return null
  const label = (i: number) => {
    const t = r.current.series[i].t
    return r.bucket === 'hour' ? t.slice(11, 16) : fmtDay(t.slice(0, 10))
  }
  const last = r.to === now && r.bucket === 'hour' ? copy.now : label(pts.length - 1)
  return { pts, x: [label(0), label(Math.floor(pts.length / 2)), last] }
}

/** The overview's four cards: people, a goal (or views), money (or uptime), and who left after one page. */
export function mapOverview(r: Report, o: { money?: (minor: number) => string; uptime: Uptime | null; now: ISODate; basis?: Basis }): Overview {
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
      ? { icon: 'goal', label: cap(goal.label || goal.value), val: fmtInt(goal.visitors), note: pe(gs), vals: [], col: '#7f9cf5', st: gs.st === 'dn' ? 'dn' : '' }
      : { icon: 'click', label: copy.kc.views, val: fmtInt(views.v), note: pe(views), vals: series.map((p) => p.pageviews), col: '#7f9cf5', st: views.st === 'dn' ? 'dn' : '' },
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
    col: '#7f9cf5',
    st: worse ? 'dn' : '',
  })
  const rows = (dim: string, name: (v: string) => string) => rowsOf(cur.dims[dim], prev?.dims[dim], prev?.kpis.visitors, name)
  return {
    kcs,
    per: perOf(r.bucket, series.length),
    shape: shapeOf(r, o.now),
    down: o.uptime?.down ?? [],
    pages: rows('page', (v) => v),
    sources: rows('referrer', (v) => sourceName(v) || host(v)),
  }
}

function uptimeKc(u: Uptime | null): Kc {
  const down = (u?.lost ?? 0) > 0
  const mins = Math.round((u?.lost ?? 0) / 60)
  let note = copy.noDowntime
  if (down) note = copy.downFor(mins)
  if (u === null || u.pct === null) note = copy.checksOff
  return {
    icon: 'uptime',
    label: copy.kc.uptime,
    val: u?.pct == null ? '–' : `${fmtFixed(u.pct, 2)}%`,
    note: { c: down ? 'dn' : '', t: note },
    vals: u?.pct == null ? [] : [100, 100, 100],
    lo: 90,
    hi: 117,
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
  languages: { key: 'language', dim: 'language', name: (v) => v },
}

/** A visit has one entry page but many pages and sections, and a sale belongs to the visit: nothing to attribute to those. */
const NO_SALE = new Set(['page', 'group', 'exit_page', 'hostname'])

/** A table of people for one tab: the dimension's rows against the period before, each said in its own words. */
export function mapTable(tab: Tab, r: Report): Table {
  const t = TABLES[tab]
  if (!t) return { rows: [] }
  const sales = !!r.current.money && !NO_SALE.has(t.key)
  const paid = new Map((sales ? (r.current.revenue_dims?.[t.key] ?? []) : []).map((x) => [x.value, x]))
  const extra = (v: string): Partial<Row> => ({ ...(t.code ? { code: v } : {}), ...(sales ? { cust: paid.get(v)?.customers ?? 0, rev: paid.get(v)?.revenue ?? 0 } : {}) })
  const rows = rowsOf(r.current.dims[t.key], r.previous?.dims[t.key], r.previous?.kpis.visitors, t.name, extra)
  return { rows, dim: t.dim }
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
