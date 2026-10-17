// Explore's numbers from the API, and nothing the API does not already say: the period's report (this one and the one
// before it, in one request), the funnel, Search Console, Web Vitals, mentions, the robots, the incident record and the
// saved views. Each section is asked for when it is opened.
import { api, cachedReport, call, rangeQS, type Filter, type Report, type ReportQuery, type WebVitals } from '../../../lib/api'
import { more } from '../../../lib/apiMore'
import { queryOf } from '../../../lib/dashQuery'
import { addDays, diffDays, fmtRange, todayIn, type Range } from '../../../lib/dates'
import { parseFilterParam } from '../../../lib/filterSet'
import { writeView } from '../../../lib/url'
import { startOfDay, uptimeOf } from '../../../features/incidents/model'
import { incidents } from '../../../features/incidents/api'
import { mentionsApi, type Period } from '../../../features/mentions/api'
import { siteNow } from '../../briefing/chart'
import { read as readHistory } from '../../briefing/useHistory'
import { hourTable, stretchBand } from '../../briefing/usual'
import type { Usual } from '../../briefing/model'
import { funnelBuilt } from '../../setup/funnelBuilt'
import type { Down, SavedView, Tab } from '../types'
import { basisOf, type Basis } from './basis'
import { scaled } from './scaled'
import { mapOverview, mapTable, optionsOf, type Uptime } from './mapReport'
import { mapBots, mapFunnel, stepsOf, mapLinks, mapMentions, mapSales, mapSearch, mapSpeed } from './mapSections'
import type { DataCtx, Meta, TabData } from './useExplore'

/** Explore asks for the deep report: the breakdowns of regions, cities, exit pages and the rest ride in the same read. */
const query = (c: DataCtx, filters: Filter[] = c.filters): ReportQuery => ({ ...queryOf({ ...c.view, filters }, c.range), deep: true })

/** The range the report compared with: the period before. */
const before = (r: Report): Range => ({ from: r.previous_from ?? r.from, to: r.previous_to ?? r.to })

const clock = (unix: number, tz: string, today: string): string => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(unix * 1000))
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
  return { pct: uptimeOf(to - from, lost, r.quiet_tracked)?.pct ?? null, down, lost }
}

/** The usual the Briefing tells a single day against: the same weekday's last weeks, up to the same time of day. */
async function usualOf(c: DataCtx): Promise<Usual | null> {
  if (c.range.from !== c.range.to) return null
  return call<Usual>('GET', `/sites/${encodeURIComponent(c.site.id)}/usual${rangeQS({ from: c.range.from, to: c.range.to })}`, undefined, undefined, true).catch(() => null)
}

/** One day is told against the Briefing's usual, not against all of the day before: the earlier day's figures are scaled to it (a day still going is only partly there). Longer periods keep the period before, and say so. */
async function toBasis(c: DataCtx, r: Report): Promise<{ report: Report; basis: Basis }> {
  const basis = basisOf({ range: c.range, filters: c.filters, compare: c.view.compare })
  if (basis !== 'usual') return { report: r, basis }
  const [u, got] = await Promise.all([usualOf(c), usualHours(c, r)])
  const hours = got?.people ?? null
  const was = r.previous?.kpis.visitors ?? 0
  // The hours of the weeks before come first, as in the Briefing; the server's usual for the day is the other way to it.
  const usual = hours ?? (u && u.average >= 5 ? u.average : null)
  if (!r.previous || usual === null || was <= 0) return { report: r, basis: usual === null ? 'previous' : 'usual' }
  return { report: { ...r, previous: scaled(r.previous, usual / was, got?.money) }, basis: 'usual' }
}

/** What the same hours of the last eight weeks brought, the part of the day that has happened (as the Briefing counts it). */
async function usualHours(c: DataCtx, r: Report): Promise<{ people: number; money: number } | null> {
  if (c.range.from !== c.range.to || r.bucket !== 'hour') return null
  const today = todayIn(c.site.timezone)
  const hist = await readHistory(c.site.id, addDays(today, -56), addDays(today, -1), 'hour').catch(() => null)
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

export async function loadTab(tab: Tab, c: DataCtx, signal: AbortSignal): Promise<TabData> {
  const q = query(c)
  const today = todayIn(c.site.timezone)
  switch (tab) {
    case 'overview': {
      const [raw, uptime] = await Promise.all([cachedReport(c.site.id, q, undefined, signal), periodUptime(c)])
      const { report, basis } = await toBasis(c, raw)
      return mapOverview(report, { money: c.money, uptime, now: today, basis })
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
      if (!conn.connected) return { on: false, enough: false, kcs: [], queries: [], pages: [] }
      const report = await cachedReport(c.site.id, q, undefined, signal)
      const p = before(report)
      const [query_, pages, prev] = await Promise.all([more.searchReport(c.site.id, q, 'query', signal), more.searchReport(c.site.id, q, 'page', signal), more.searchReport(c.site.id, { ...q, from: p.from, to: p.to, compare: undefined }, 'query', signal).catch(() => undefined)])
      return mapSearch({ query: query_, pages, prev })
    }
    case 'speed': {
      const report = await cachedReport(c.site.id, q, undefined, signal)
      const p = before(report)
      // A site that does not measure speed has none to show.
      const none: WebVitals = { samples: 0, good: 0 }
      const [cur, prev] = await Promise.all([more.vitals(c.site.id, q).catch(() => none), more.vitals(c.site.id, { ...q, from: p.from, to: p.to, compare: undefined }).catch(() => undefined)])
      return mapSpeed(cur, prev)
    }
    case 'mentions': {
      const r = await mentionsApi.list(c.site.id, periodFor(c), signal)
      return mapMentions(r.mentions, c.site.timezone, today)
    }
    case 'bots':
      // A site that does not watch for robots has none to list.
      return more.crawlers(c.site.id, q).then(mapBots, () => [])
    case 'outbound': {
      const r = await call<{ properties: { key: string; value: string; visitors: number }[] | null }>('GET', `/sites/${c.site.id}/report/goal-props${rangeQS(q)}&goal=outbound_click`, undefined, signal)
      return { rows: mapLinks(r.properties ?? []) }
    }
    case 'highlights': case 'overtime': case 'hours': case 'revmap': case 'earners': case 'sells': case 'people': case 'buyers': case 'retention': case 'vsale': case 'toconvert': case 'flow': case 'ai':
      // These read their own numbers (views/Hosted.tsx).
      return null
    default:
      return mapTable(tab, (await toBasis(c, await cachedReport(c.site.id, q, undefined, signal))).report)
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
  return { connected: { rev: !!report.current.money, search, goals: (report.current.goals ?? []).length > 0 }, options: optionsOf(report.current), views: segments.map(viewOf), }
}

export async function saveView(site: string, view: DataCtx['view'], v: SavedView): Promise<void> {
  const q = writeView({ ...view, filters: v.filters, live: false, briefing: false, v: undefined }).slice(1)
  await more.saveSegment(site, v.name, q || 'view=briefing')
}

export async function removeView(site: string, v: SavedView): Promise<void> {
  if (v.id) await api.deleteSegment(site, v.id)
}

