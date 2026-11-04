// Explore's numbers from the API, and nothing the API does not already say: the period's report (this one and the one
// before it, in one request), the funnel, Search Console, Web Vitals, mentions, the robots, the incident record and the
// saved views. Each section is asked for when it is opened.
import { api, cachedReport, call, rangeQS, type Filter, type Report, type ReportQuery, type WebVitals } from '../../../lib/api'
import { more } from '../../../lib/apiMore'
import { brandOf } from '../../../lib/brandIcons'
import { channelLabel } from '../../../lib/palette'
import { copy } from '../copy'
import { MIN_VITALS } from '../../../lib/api'
import { queryOf } from '../../../lib/dashQuery'
import { addDays, diffDays, fmtRange, todayIn, type Range } from '../../../lib/dates'
import { parseFilterParam } from '../../../lib/filterSet'
import { writeView } from '../../../lib/url'
import { startOfDay, uptimeOf } from '../../../features/incidents/model'
import { incidents } from '../../../features/incidents/api'
import { mentionsApi, type Period } from '../../../features/mentions/api'
import { siteNow } from '../../briefing/chart'
import { againstName } from '../../briefing/compare'
import { read as readHistory } from '../../briefing/useHistory'
import { hourTable, stretchBand } from '../../briefing/usual'
import { usualBand } from '../../briefing/useSlices'
import type { Usual } from '../../briefing/model'
import { funnelBuilt } from '../../setup/funnelBuilt'
import { seeNetworks } from '../sections'
import type { Down, SavedView, Tab } from '../types'
import { basisOf, type Basis } from './basis'
import { insightOf } from './insight'
import { ENOUGH, headline, mainOf, ranked, rateOf, type QualityRow } from './quality'
import { EXPLORE_ROWS, LINKS_ROWS } from './rows'
import { scaled, withSourceUsuals } from './scaled'
import { mapEngage, mapOverview, mapTable, mapTops, optionsOf, type Uptime } from './mapReport'
import { mapSlowCost } from './slowCost'
import { mapNetworks } from './networks'
import { mapBots, mapFunnel, stepsOf, mapLinks, mapMentions, mapSales, mapSearch, mapSpeed } from './mapSections'
import type { DataCtx, Meta, TabData } from './useExplore'
import { dateFmt } from '../../../lib/format'

/** Explore asks for the deep report: the breakdowns of regions, cities, exit pages and the rest ride in the same read. */
const query = (c: DataCtx, filters: Filter[] = c.filters): ReportQuery => ({ ...queryOf({ ...c.view, filters }, c.range), deep: true, limit: EXPLORE_ROWS })
/** Overview and What changed read only pages, sources and the other plain breakdowns, never the deep ones, so they ask for the lighter report and it comes back sooner. */
const plainQuery = (c: DataCtx): ReportQuery => ({ ...query(c), deep: false })

/** How people read, this period and the one before it (the reading depth is read for each; a site without it says a dash). */
async function engagement(c: DataCtx, q: ReportQuery, report: Report, signal?: AbortSignal) {
  const p = before(report)
  const [cur, prev] = await Promise.all([more.scroll(c.site.id, q, signal).catch(() => undefined), report.previous ? more.scroll(c.site.id, { ...q, from: p.from, to: p.to, compare: undefined }, signal).catch(() => undefined) : undefined])
  return mapEngage({ kpis: report.current.kpis, scroll: cur }, report.previous ? { kpis: report.previous.kpis, scroll: prev } : undefined)
}

/** The range the report compared with: the period before. */
const before = (r: Report): Range => ({ from: r.previous_from ?? r.from, to: r.previous_to ?? r.to })

const clock = (unix: number, tz: string, today: string): string => {
  const parts = dateFmt('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(unix * 1000))
  const at = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const day = `${at('year')}-${at('month')}-${at('day')}`
  return day === today ? `${at('hour')}:${at('minute')}` : `${day.slice(5)} ${at('hour')}:${at('minute')}`
}

/** What the incident record says about the period: how much of it the site answered, and each time it did not. */
async function periodUptime(c: DataCtx): Promise<Uptime> {
  const { site, range } = c
  if (!site.watched_since) return { pct: null, down: [], lost: 0 }
  const now = Math.floor(Date.now() / 1000)
  const to = Math.min(startOfDay(range.to, site.timezone) + 86400, now)
  const from = Math.min(Math.max(startOfDay(range.from, site.timezone), site.watched_since), to)
  const r = await incidents.period(site.id, from, to)
  const lost = r.summary.seconds
  const today = todayIn(site.timezone)
  const down: Down[] = r.incidents.map((x) => {
    const end = x.ended_at ?? now
    return { from: clock(x.started_at, site.timezone, today), to: clock(end, site.timezone, today), min: Math.round((end - x.started_at) / 60) }
  })
  return { pct: uptimeOf(to - from, lost, r.quiet_tracked, r.summary.paused)?.pct ?? null, down, lost }
}

/** The usual the Briefing tells a single day against: the same weekday's last weeks, up to the same time of day. */
async function usualOf(c: DataCtx): Promise<Usual | null> {
  if (c.range.from !== c.range.to) return null
  return call<Usual>('GET', `/sites/${encodeURIComponent(c.site.id)}/usual${rangeQS({ from: c.range.from, to: c.range.to })}`, undefined, undefined, true).catch(() => null)
}

/** One day is told against the Briefing's usual, not against all of the day before: the earlier day's figures are scaled to it (a day still going is only partly there). Longer periods keep the period before, and say so. */
async function toBasis(c: DataCtx, r: Report, early: Early | null): Promise<{ report: Report; basis: Basis }> {
  const basis = basisOf({ range: c.range, filters: c.filters, compare: c.view.compare })
  if (basis !== 'usual') return { report: r, basis }
  const pre = early ?? earlyOf(c)
  // The sources' usuals go out with the other two reads, not after them.
  const top = (r.current.dims.referrer ?? []).filter((x) => x.value && x.value.replace(/^www\./, '') !== c.site.domain.replace(/^www\./, '')).slice(0, 6)
  const asked = (r.previous?.kpis.visitors ?? 0) > 0 ? Promise.all(top.map((x) => usualBand(c.site.id, c.range.to, [{ dim: 'referrer', value: x.value }]))) : Promise.resolve([])
  const [u, got, bands] = await Promise.all([pre.usual, usualHours(c, r, pre.history), asked])
  const hours = got?.people ?? null
  const was = r.previous?.kpis.visitors ?? 0
  // The hours of the weeks before come first, as in the Briefing; the server's usual for the day is the other way to it.
  const usual = hours ?? (u && u.average >= 5 ? u.average : null)
  if (!r.previous || usual === null || was <= 0) return { report: r, basis: usual === null ? 'previous' : 'usual' }
  const scaledPrev = scaled(r.previous, usual / was, got?.money)
  // The sources the Briefing tells apart are told against the same usual here (the top six, as there).
  const usuals = new Map<string, number>()
  top.forEach((x, i) => {
    const b = bands[i]
    if (b) usuals.set(x.value, b.c)
  })
  return { report: { ...r, previous: withSourceUsuals(scaledPrev, usuals) }, basis: 'usual' }
}

type History = ReturnType<typeof historyOf>
/** The two reads the usual needs from the site and the day alone, started with the report instead of after it. */
interface Early {
  usual: Promise<Usual | null>
  history: History
}
const earlyOf = (c: DataCtx): Early => ({ usual: usualOf(c), history: historyOf(c) })
function historyOf(c: DataCtx) {
  if (c.range.from !== c.range.to) return Promise.resolve(null)
  const today = todayIn(c.site.timezone)
  return readHistory(c.site.id, addDays(today, -56), addDays(today, -1), 'hour').catch(() => null)
}

/** What the same hours of the last eight weeks brought, the part of the day that has happened (as the Briefing counts it). */
async function usualHours(c: DataCtx, r: Report, history: History): Promise<{ people: number; money: number } | null> {
  if (c.range.from !== c.range.to || r.bucket !== 'hour') return null
  const today = todayIn(c.site.timezone)
  const hist = await history
  const table = hist ? hourTable(hist, today) : null
  if (!table) return null
  const clock = siteNow(c.site.timezone, new Date())
  const nowHour = Number(clock.slice(11, 13)) + Number(clock.slice(14, 16)) / 60
  const live = c.range.to === today
  const hours = r.current.series
    .map((p) => ({ day: p.t.slice(0, 10), hour: Number(p.t.slice(11, 13)) }))
    .filter((h) => !(live && h.day === today && h.hour > nowHour))
    .map((h) => ({ ...h, fr: live && h.day === today ? Math.min(1, Math.max(0, nowHour - h.hour)) : 1 }))
  const sales = hist ? hourTable(hist, today, 'short', (p) => p.revenue ?? 0, true) : null
  return { people: stretchBand(table, hours).c, money: sales ? stretchBand(sales, hours, 'short', true).c : 0 }
}

const periodFor = (c: DataCtx): Period => {
  const days = diffDays(c.range.from, c.range.to) + 1
  if (days <= 7) return '7d'
  if (days <= 30) return '30d'
  return days <= 90 ? '90d' : '1y'
}

export async function loadTab(tab: Tab, c: DataCtx, signal: AbortSignal, soon?: (d: TabData) => void): Promise<TabData> {
  const q = query(c)
  const today = todayIn(c.site.timezone)
  switch (tab) {
    case 'changed':
    {
      // Measured against the same period as the changes below it: the cards and the table have to agree.
      const [report, uptime] = await Promise.all([cachedReport(c.site.id, plainQuery(c), undefined, signal), periodUptime(c)])
      return { ...mapOverview(report, { money: c.money, uptime, now: today, basis: 'previous', against: againstName(c.view.period, c.view.compare === 'none' ? 'previous' : c.view.compare, c.range) }), report }
    }
    case 'overview': {
      const pre = basisOf({ range: c.range, filters: c.filters, compare: c.view.compare }) === 'usual' ? earlyOf(c) : null
      const [raw, uptime] = await Promise.all([cachedReport(c.site.id, plainQuery(c), undefined, signal), periodUptime(c)])
      const against = c.view.compare === 'none' ? undefined : againstName(c.view.period, c.view.compare, c.range)
      const cards = (report: Report, basis: Basis) => mapOverview(report, { money: c.money, uptime, now: today, basis, against })
      // The cards show from the plain report at once; the numbers told against the usual replace them when they are here.
      if (pre) soon?.(cards(raw, 'previous'))
      const { report, basis } = await toBasis(c, raw, pre)
      return cards(report, basis)
    }
    case 'funnels': {
      const report = await cachedReport(c.site.id, q, undefined, signal)
      const pages = report.current.dims.entry_page ?? []
      const goal = (report.current.goals ?? [])[0]
      const steps = stepsOf(c.view.funnel, pages, goal, !!report.current.money)
      if (steps.length < 2) return mapFunnel({ cur: [], report, ghost: !report.current.money })
      funnelBuilt(c.site.id, c.view.funnel?.length ?? 0)
      const p = before(report)
      const [cur, prev] = await Promise.all([more.funnel(c.site.id, q, steps), report.previous ? more.funnel(c.site.id, { ...q, from: p.from, to: p.to, compare: undefined }, steps) : Promise.resolve(null)])
      return mapFunnel({ cur: cur.steps, prev: prev?.steps, report, ghost: !report.current.money })
    }
    case 'sales': {
      const report = await cachedReport(c.site.id, q, undefined, signal)
      return mapSales(report.current.money, fmtRange(c.range, today))
    }
    case 'search': {
      const conn = await more.searchConsole(c.site.id)
      if (!conn.connected) return { on: false, enough: false, kcs: [], queries: [], pages: [], days: [] }
      const report = await cachedReport(c.site.id, q, undefined, signal)
      const p = before(report)
      const [query_, pages, days, prev] = await Promise.all([more.searchReport(c.site.id, q, 'query', signal), more.searchReport(c.site.id, q, 'page', signal), more.searchReport(c.site.id, q, 'date', signal).catch(() => undefined), more.searchReport(c.site.id, { ...q, from: p.from, to: p.to, compare: undefined }, 'query', signal).catch(() => undefined)])
      return mapSearch({ query: query_, pages, days, prev })
    }
    case 'paths': {
      const r = await more.paths(c.site.id, q, signal)
      return { ...r, first: r.first ?? null, last: r.last ?? null }
    }
    case 'quality': {
      const report = await cachedReport(c.site.id, q, undefined, signal)
      // Named sources: each referring site, and Direct (which has no referrer, so it comes from the channels).
      const direct = (report.current.dims.channel ?? []).filter((r) => r.value === 'Direct' && r.visitors > 0).map((r) => ({ ...r, value: '' }))
      const top = [...(report.current.dims.referrer ?? []).filter((r) => r.value && r.visitors > 0), ...direct].sort((a, b) => b.visitors - a.visitors).slice(0, 6)
      const goal = report.current.signup?.goal ?? report.current.goals?.[0]?.value ?? null
      const paid = !!report.current.money
      const main = mainOf(goal !== null, paid)
      const rows = await Promise.all(top.map(async (s): Promise<QualityRow> => {
        const filters = [...c.filters, s.value ? { dim: 'referrer', value: s.value } : { dim: 'channel', value: 'Direct' }]
        const one = await cachedReport(c.site.id, { ...query(c, filters), compare: undefined, cfrom: undefined, cto: undefined, sofar: false }, undefined, signal)
        const page = one.current.dims.entry_page?.[0]?.value ?? null
        const reached = goal === null ? null : (one.current.goals ?? []).find((g) => g.value === goal)?.visitors ?? 0
        const speed = page ? await more.vitals(c.site.id, { ...q, filters: [...c.filters, { dim: 'page', value: page }] }).catch(() => null) : null
        const k = one.current.kpis
        return {
          value: s.value,
          name: s.value ? brandOf(s.value)?.name ?? s.value.replace(/^www\./, '') : copy.direct,
          channel: s.value ? channelLabel(one.current.dims.channel?.[0]?.value ?? '') : '',
          people: s.visitors,
          page,
          engaged: k.sessions > 0 && s.visitors >= ENOUGH ? 1 - k.bounce_rate : null,
          goal: rateOf(reached, s.visitors),
          sales: paid ? rateOf(one.current.money?.paying_visitors ?? 0, s.visitors) : null,
          lcp: speed && (speed.lcp_n ?? 0) >= MIN_VITALS ? speed.lcp_ms ?? null : null,
        }
      }))
      return { say: headline(rows, main), main, goal, paid, rows: ranked(rows, main) }
    }
    case 'speed': {
      const report = await cachedReport(c.site.id, q, undefined, signal)
      const p = before(report)
      // A site that does not measure speed has none to show.
      const none: WebVitals = { samples: 0, good: 0 }
      const [cur, prev, cost] = await Promise.all([
        more.vitals(c.site.id, q).catch(() => none),
        more.vitals(c.site.id, { ...q, from: p.from, to: p.to, compare: undefined }).catch(() => undefined),
        more.slowCost(c.site.id, q).catch(() => null),
      ])
      return { ...mapSpeed(cur, prev), cost: mapSlowCost(cost) }
    }
    case 'networks': {
      const report = await cachedReport(c.site.id, q, undefined, signal)
      // A site that does not measure speed has no load times to show.
      const speed = await more.vitals(c.site.id, q).catch(() => null)
      return mapNetworks(report, speed)
    }
    case 'mentions': {
      const r = await mentionsApi.list(c.site.id, periodFor(c), signal)
      return mapMentions(r.mentions, c.site.timezone, today)
    }
    case 'bots':
      // A site that does not watch for robots has none to list.
      return more.crawlers(c.site.id, q).then(mapBots, () => [])
    case 'outbound': {
      const r = await call<{ properties: { key: string; value: string; visitors: number }[] | null }>('GET', `/sites/${c.site.id}/report/goal-props${rangeQS(q)}&goal=outbound_click&limit=${LINKS_ROWS}`, undefined, signal)
      const rows = mapLinks(r.properties ?? [])
      const noneAtAll = rows.length === 0 && c.filters.length > 0 && !(await call<{ properties: unknown[] | null }>('GET', `/sites/${c.site.id}/report/goal-props${rangeQS({ ...q, filters: [] })}&goal=outbound_click&limit=1`, undefined, signal)).properties?.length
      // A share here is of the clicks listed (the report names no total for them).
      return { rows, of: rows.reduce((p, x) => p + x.v, 0), noneAtAll }
    }
    case 'highlights': case 'overtime': case 'hours': case 'revmap': case 'earners': case 'sells': case 'people': case 'retention': case 'vsale': case 'toconvert': case 'flow': case 'ai': case 'answers':
      // These read their own numbers (views/Hosted.tsx).
      return null
    default: {
      const raw = await cachedReport(c.site.id, q, undefined, signal)
      const { report } = await toBasis(c, raw, null)
      const table = mapTable(tab, report)
      if (tab === 'devices') return { ...table, tops: mapTops(report) }
      if (tab === 'pages') return { ...table, ...(c.view.compare !== 'none' ? { say: insightOf(table.rows) } : {}), engage: await engagement(c, q, raw, signal) }
      return tab === 'countries' && c.view.compare !== 'none' ? { ...table, say: insightOf(table.rows) } : table
    }
  }
}

const viewOf = (s: { id: string; name: string; query: string }): SavedView => ({ id: s.id, name: s.name, filters: new URLSearchParams(s.query).getAll('f').flatMap((f) => parseFilterParam(f) ?? []) })

/** What the menus need around the numbers: the values a filter can take, what is connected, the saved views. */
export async function loadMeta(c: DataCtx): Promise<Meta> {
  const [report, search, segments] = await Promise.all([
    cachedReport(c.site.id, query(c, [])),
    more.searchConsole(c.site.id).then(
      (r) => r.connected,
      () => false,
    ),
    api.segments(c.site.id).then(
      (r) => r.segments ?? [],
      () => [],
    ),
  ])
  seeNetworks((report.current.dims.network ?? []).length > 0)
  return { connected: { rev: !!report.current.money, search, goals: (report.current.goals ?? []).length > 0 }, options: optionsOf(report.current), views: segments.map(viewOf), }
}

export async function saveView(site: string, view: DataCtx['view'], v: SavedView): Promise<void> {
  const q = writeView({ ...view, filters: v.filters, live: false, briefing: false, v: undefined }).slice(1)
  await more.saveSegment(site, v.name, q || 'view=briefing')
}

export async function removeView(site: string, v: SavedView): Promise<void> {
  if (v.id) await api.deleteSegment(site, v.id)
}

