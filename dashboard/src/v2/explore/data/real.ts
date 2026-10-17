// Explore's numbers from the API, and nothing the API does not already say: the period's report (this one and the one
// before it, in one request), the funnel, Search Console, Web Vitals, mentions, the robots, the incident record and the
// saved views. Each section is asked for when it is opened.
import { api, cachedReport, call, rangeQS, type Filter, type Report, type ReportQuery, type WebVitals } from '../../../lib/api'
import { more } from '../../../lib/apiMore'
import { queryOf } from '../../../lib/dashQuery'
import { diffDays, fmtRange, todayIn, type Range } from '../../../lib/dates'
import { parseFilterParam } from '../../../lib/filterSet'
import { writeView } from '../../../lib/url'
import { startOfDay, uptimeOf } from '../../../features/incidents/model'
import { incidents } from '../../../features/incidents/api'
import { mentionsApi, type Period } from '../../../features/mentions/api'
import type { Down, SavedView, Tab } from '../types'
import { mapOverview, mapTable, optionsOf, type Uptime } from './mapReport'
import { mapBots, mapFunnel, mapLinks, mapMentions, mapSales, mapSearch, mapSpeed } from './mapSections'
import type { DataCtx, Meta, TabData } from './useExplore'

const query = (c: DataCtx, filters: Filter[] = c.filters): ReportQuery => queryOf({ ...c.view, filters }, c.range)

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
      const [report, uptime] = await Promise.all([cachedReport(c.site.id, q, undefined, signal), periodUptime(c)])
      return mapOverview(report, { money: c.money, uptime, now: today })
    }
    case 'funnels': {
      const report = await cachedReport(c.site.id, q, undefined, signal)
      const pages = report.current.dims.entry_page ?? []
      const goal = (report.current.goals ?? [])[0]
      const steps = [...pages.slice(0, 2).map((p) => ({ kind: 'page' as const, value: p.value })), ...(goal ? [{ kind: 'goal' as const, value: goal.value }] : [])]
      if (steps.length < 2) return mapFunnel({ cur: [], report, ghost: !report.current.money })
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
      return mapTable(tab, await cachedReport(c.site.id, q, undefined, signal))
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
  await more.saveSegment(site, v.name, q || 'view=data')
}

export async function removeView(site: string, v: SavedView): Promise<void> {
  if (v.id) await api.deleteSegment(site, v.id)
}

