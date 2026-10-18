// The API a fixture answers with, by path. Anything it does not know answers 404, and says so in the console. Dev only.
import type { FunnelStep, Site, VerifiedSource } from '../../lib/api'
import { CTYS, DEVS, END, GKIND, GNEW, GSC, SITES, SRCS, type SiteDef } from './data'
import {
  countIn,
  dailyOf,
  dateOf,
  dayIndex,
  hasMoney,
  online,
  parseQuery,
  REFS,
  reportOf,
  salesIn,
  siteOf,
  type Ctx,
} from './report'
import { busierOf, nowOf } from './live'
import { crawlersOf, funnelOf, heatOf, linksOf, scrollOf, segments } from './sections'
import { hash, mulberry, pick } from './rand'
import { setupChange, setupOf } from './setup'
import { protoDefs, protoOverview, protoSiteList } from './menuSites'
import { osOf, visitsOf, BROWSERS } from './visits'

const CHANNEL_OF: Record<string, string> = { google: 'Search', direct: 'Direct', hn: 'Referral', reddit: 'Social', x: 'Social', newsletter: 'Email', chatgpt: 'Referral', github: 'Referral', badge: 'Referral' }
const moduleOn = (c: Ctx, m: string): boolean => {
  if (m === 'revenue') return c.conn.rev
  if (m === 'search') return c.conn.search
  return !['consent', 'forms'].includes(m)
}
const MODULES = ['goals', 'outbound', 'revenue', 'funnels', 'notes', 'rhythm', 'journeys', 'map', 'retention', 'vitals', 'consent', 'crawlers', 'forms', 'heatmaps', 'search']

/** `&role=viewer` looks at the pages as a viewer sees them (kept for the tab). */
function roleOf(): string {
  const key = 'trckable:fixture:role'
  const asked = new URLSearchParams(location.search).get('role')
  try {
    if (asked) sessionStorage.setItem(key, asked)
    return asked ?? sessionStorage.getItem(key) ?? 'owner'
  } catch {
    return asked ?? 'owner'
  }
}

export interface Reply {
  status: number
  body: unknown
}
const ok = (body: unknown): Reply => ({ status: 200, body })
const none = (): Reply => ({ status: 204, body: undefined })

const secs = (c: Ctx, min: number) => Math.floor((c.w.start + min * 60000) / 1000)
const T = (d: number, h: number, m: number) => (END + d) * 1440 + h * 60 + m

interface Men {
  src: string
  title: string
  pts: number
  cm: number
  min: number
}
const MEN_ALL: Record<string, Men[]> = {
  trk: [
    { src: 'Reddit r/selfhosted', title: 'What are you using for web analytics?', pts: 86, cm: 41, min: T(-9, 20, 10) },
    { src: 'GitHub', title: 'awesome-selfhosted: add trckable', pts: 312, cm: 12, min: T(-24, 11, 0) },
  ],
  shop: [{ src: 'Reddit r/sneakers', title: 'Anyone tried shop.example.dev sneakers?', pts: 23, cm: 9, min: T(-4, 19, 30) }],
  docs: [{ src: 'Stack Overflow', title: 'How do I track goals with the trckable API?', pts: 7, cm: 2, min: T(-3, 15, 0) }],
  alb: [{ src: 'Hacker News', title: 'Ask HN: Remote-friendly cafes in Albania', pts: 14, cm: 6, min: T(-15, 12, 0) }],
}
const mentionsOf = (c: Ctx, id: string): Men[] => {
  const l = (MEN_ALL[id] ?? []).slice()
  if (c.w.key === 'hn' && id === 'trk') l.unshift({ src: 'Hacker News', title: 'Show HN: Trckable, privacy-friendly analytics', pts: 214, cm: 58, min: T(0, 14, 5) })
  return l.filter((x) => x.min <= c.nowAbs)
}

const NOTES: Record<string, [number, number, string][]> = {
  trk: [
    [-12, 10, 'Shipped the new pricing page'],
    [-40, 9, 'Switched the signup form to one step'],
  ],
  shop: [[-6, 18, 'Newsletter went out']],
  docs: [[-20, 11, 'Rewrote the quickstart']],
  alb: [[-9, 20, 'Posted about Tirana cafes']],
}
const notesOf = (c: Ctx, id: string) => {
  const out = (NOTES[id] ?? []).map(([d, h, text]) => ({ min: T(d, h, 0), text }))
  if (c.w.key === 'hn' && id === 'trk') out.push({ min: T(0, 14, 5), text: 'Posted on Show HN' })
  return out.filter((n) => n.min <= c.nowAbs).sort((a, b) => a.min - b.min)
}

const VIT_BASE: Record<string, [number, number, number]> = { trk: [2.1, 180, 0.05], shop: [2.6, 210, 0.08], docs: [1.4, 90, 0.01], alb: [1.9, 120, 0.03] }
function vitals(c: Ctx, id: string): { usual: number[]; cur: number[]; worse: boolean } {
  const b = VIT_BASE[id]
  const worse = (c.w.key === 'hn' && id === 'trk') || hash(`vit${id}${c.w.seed}${c.w.key}`) % 7 === 0
  return { usual: b, cur: worse ? [b[0] * 1.62, b[1] * 1.35, b[2] * 1.8] : b.map((x, i) => x * (1 + ((hash(`${id}${i}${c.w.seed}`) % 9) - 4) / 100)), worse }
}

function milestone(c: Ctx, site: SiteDef): number | null {
  const o = visitsOf(c.w, site.id, c.nowAbs)
  let before = 0
  let td = 0
  for (let i = 0; i < o.n; i++) {
    if (o.t[i] >= END * 1440) td++
    else before++
  }
  const off = c.w.key === 'hn' && site.id === 'trk' ? 100000 - before - td * 0.6 : ({ trk: 41000, shop: 23000, docs: 8000, alb: 1200 } as Record<string, number>)[site.id]
  const a = before + off
  const b = a + td
  return [1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000].filter((m) => a < m && b >= m).pop() ?? null
}

function incidentsOf(c: Ctx, site: SiteDef) {
  return c.w.data[site.id].inc
    .filter((i) => i.a <= c.nowAbs)
    .map((i) => ({
      id: `inc_${site.id}_${i.a}`,
      site: site.id,
      kind: 'down' as const,
      started_at: secs(c, i.a),
      ended_at: i.b <= c.nowAbs ? secs(c, i.b) : null,
      cause: 'no answer',
      expected_visits: Math.round(((i.b <= c.nowAbs ? i.b : c.nowAbs) - i.a) * 0.9),
      note: '',
    }))
}

function siteJson(c: Ctx, s: SiteDef): Site {
  const v = visitsOf(c.w, s.id, c.nowAbs)
  const sc = c.w.sc
  const first = sc.since?.[s.id] != null ? sc.since[s.id] * 1440 : 0
  const ongoing = c.w.data[s.id].inc.find((i) => c.nowAbs >= i.a && c.nowAbs < i.b)
  const since = secs(c, first) - (sc.since?.[s.id] != null && v.n === 0 ? -(c.nowAbs - 30) * 60 : 86400 * 12)
  // The first day of data is the site's first day: it was added a few hours ago.
  const created = v.n === 0 ? secs(c, c.nowAbs - 25) : since
  const addedAt = c.w.key === 'firstday' ? secs(c, c.nowAbs - 300) : created
  const lastAt = v.n ? secs(c, v.t[v.n - 1]) : undefined
  const verified: VerifiedSource[] = [{ kind: 'snippet', ok: true, since: created, checked: secs(c, c.nowAbs), detail: 'the snippet is on the homepage' }]
  if (c.conn.rev && s.money) verified.push({ kind: 'payments', ok: true, since: created, checked: secs(c, c.nowAbs), detail: 'payments are flowing' })
  if (c.conn.search) verified.push({ kind: 'gsc', ok: true, since: created, checked: secs(c, c.nowAbs), detail: 'Search Console answers' })
  const out: Site = {
    id: s.id,
    domain: s.name,
    name: s.name,
    timezone: 'UTC',
    currency: 'USD',
    proxy_key: `tkb_px_${s.id}`,
    created_at: addedAt,
    watched_since: created,
    mentions: mentionsOf(c, s.id).length > 0,
    week_start: 1,
    check: { at: secs(c, c.nowAbs - 3), found: 'site' },
    verified: { sources: verified },
  }
  if (lastAt) out.last_event_at = lastAt
  if (ongoing) {
    out.down_since = secs(c, ongoing.a)
    out.down_cause = 'no answer'
  }
  return out
}

const CITY: Record<string, string[]> = {
  US: ['Austin', 'Brooklyn', 'Seattle'],
  DE: ['Berlin', 'Hamburg', 'Munich'],
  GB: ['Leeds', 'Bristol', 'Glasgow'],
  IN: ['Pune', 'Bengaluru', 'Hyderabad'],
  FR: ['Lyon', 'Nantes', 'Lille'],
  NL: ['Utrecht', 'Rotterdam', 'Eindhoven'],
  CA: ['Toronto', 'Montreal', 'Calgary'],
  AL: ['Tirana', 'Durrës', 'Shkodër'],
}

function events(c: Ctx, id: string, limit: number) {
  const v = visitsOf(c.w, id, c.nowAbs)
  const site = siteOf(id)
  const out = []
  // The latest visitors, a page at a time (the first page carries where they came from).
  for (let i = v.n - 1; i >= 0 && out.length < limit; i--) {
    const cc = CTYS[v.cty[i]].id
    const src = SRCS[v.s[i]].id
    const r = mulberry(hash(`ev${id}${i}`))
    for (let q = 0; q < v.np[i]; q++) {
      out.push({
        seq: i * 10 + q,
        ts: new Date(c.w.start + v.t[i] * 60000 + q * 45000).toISOString(),
        kind: 'pageview',
        visitor: `v${i}`,
        session: `s${i}`,
        path: site.pages[q ? pick(r, site.pg[v.s[i]]) : v.pg[i]][0],
        hostname: site.name,
        referrer: q ? undefined : REFS[src],
        country: cc,
        city: CITY[cc][i % 3],
        device: DEVS[v.dev[i]].name,
        browser: BROWSERS[v.br[i]],
        os: osOf(v.dev[i], v.br[i]),
      })
    }
  }
  return out.sort((x, y) => y.ts.localeCompare(x.ts)).slice(0, limit)
}

function searchReport(c: Ctx, id: string, sp: URLSearchParams) {
  const q = parseQuery(sp)
  const g = reportOf(c, id, { ...q, filters: [{ dim: 'referrer', not: false, value: 'google.com' }] }).current.kpis.visitors
  const dim = sp.get('dim') === 'page' ? 'page' : 'query'
  // The scenario's search story (new query, one that rose, a better position, fewer clicks) belongs to the period that holds today.
  const now = q.to >= dateOf(c, END)
  const kind = now ? GKIND[c.w.key]?.[id] : null
  const rows = (GSC[id] ?? []).map(([key, share, pos, ctr], i) => {
    const m = kind?.t === 'top' && kind.qi === i ? (kind.m ?? 1) : 1
    const clicks = Math.round(g * share * m)
    const p = kind?.t === 'pos' ? pos + (kind.dp ?? 0) : pos
    const im = kind?.t === 'ctr' ? (kind.im ?? 1) : 1
    return { key, clicks, impressions: Math.round((clicks / Math.max(ctr, 0.005)) * im), ctr, position: p }
  })
  if (kind?.t === 'new' && GNEW[id]) rows.push({ key: GNEW[id], clicks: Math.round(g * 0.07), impressions: Math.round((g * 0.07) / 0.03), ctr: 0.03, position: 8.4 })
  rows.sort((a, b) => b.clicks - a.clicks)
  return { property: `sc-domain:${siteOf(id).name}`, dim, rows: dim === 'query' ? rows : null, from: q.from, to: q.to, clicks: rows.reduce((p, x) => p + x.clicks, 0), impressions: rows.reduce((p, x) => p + x.impressions, 0), preliminary_from: dateOf(c, END - 1), ignored_filters: null }
}

/** The sites whose milestone the person has put away: it is not told again until the page is loaded again. */
const closed = new Set<string>()

export function answer(c: Ctx, method: string, path: string, sp: URLSearchParams, body?: unknown): Reply | null {
  const seg = /^\/sites\/([^/]+)\/segments(?:\/(.+))?$/.exec(path)
  if (seg && method === 'POST') return ok(segments.add(decodeURIComponent(seg[1]), body as { name: string; query: string }))
  if (seg?.[2] && method === 'DELETE') {
    segments.drop(decodeURIComponent(seg[1]), seg[2])
    return none()
  }
  if (/^\/sites\/[^/]+\/setup(\/|$)/.test(path)) {
    const out = method === 'GET' ? setupOf() : setupChange(method, path, body)
    if (out) return ok(out)
  }
  const seen = /^\/sites\/([^/]+)\/milestones\/seen$/.exec(path)
  if (seen && method === 'POST') {
    closed.add(decodeURIComponent(seen[1]))
    return none()
  }
  if (method !== 'GET') return none()
  const sites = SITES
  const proto = protoDefs()
  switch (path) {
    case '/setup':
      return ok({ email_codes: false, needs_setup: false, sso: [] })
    case '/me':
      return ok({ kind: 'user', email: 'albi@example.com', role: roleOf(), ip: '203.0.113.7', operator: true, version: '0.7.23', keys: {}, update_check: false, must_change: false, mentions: true })
    case '/account':
      return ok({ email: 'albi@example.com', name: 'Albi', has_avatar: false })
    case '/sites':
      return ok({ sites: proto ? protoSiteList(proto, (id) => siteJson(c, sites.find((x) => x.id === id) ?? sites[0]), (m) => secs(c, c.nowAbs + m)) : sites.map((s) => siteJson(c, s)) })
    case '/site-layout':
      return ok({ order: [], pinned: [], groups: [] })
    case '/overview': {
      const days = Number(sp.get('days') ?? 30)
      const d2 = END
      if (proto) return ok({ days, sites: protoOverview(proto) })
      return ok({
        days,
        sites: sites.map((s) => {
          const cur = dailyOf(c, s.id, d2 - days + 1, d2)
          const prev = dailyOf(c, s.id, d2 - 2 * days + 1, d2 - days)
          const sum = (l: typeof cur, f: (d: (typeof cur)[number]) => number) => l.reduce((p, x) => p + f(x), 0)
          return {
            id: s.id,
            domain: s.name,
            name: s.name,
            visitors: sum(cur, (d) => d.kpis.visitors),
            pageviews: sum(cur, (d) => d.kpis.pageviews),
            bounce_rate: 0.4,
            previous_visitors: sum(prev, (d) => d.kpis.visitors),
            series: cur.map((d) => d.kpis.visitors),
            online: online(c, s),
            currency: 'USD',
            exponent: 2,
          }
        }),
      })
    }
    case '/incidents':
      return ok({ incidents: sites.flatMap((s) => incidentsOf(c, s)), quiet_tracked: Object.fromEntries(sites.map((s) => [s.id, true])) })
  }
  const m = /^\/sites\/([^/]+)\/(.+)$/.exec(path)
  if (!m) return null
  const id = decodeURIComponent(m[1])
  const rest = m[2]
  const site = sites.find((s) => s.id === id)
  if (!site) return { status: 404, body: { error: 'no such site' } }
  switch (rest) {
    case 'report':
      return ok(reportOf(c, id, parseQuery(sp)))
    case 'report/vitals': {
      const q = parseQuery(sp)
      const long = dayIndex(c, q.to) - dayIndex(c, q.from) > 1
      const x = vitals(c, id)
      const v = long ? x.usual : x.cur
      return ok({ samples: 40, lcp_ms: Math.round(v[0] * 1000), inp_ms: Math.round(v[1]), cls_1k: Math.round(v[2] * 1000), good: 1, pages: [{ value: site.pages[0][0], visitors: Math.round(v[0] * 1000), pageviews: 40 }] })
    }
    case 'report/search':
      return ok(searchReport(c, id, sp))
    case 'search-console':
      return ok(c.conn.search ? { connected: true, connection: { client_email: 'trckable@fixture.iam.gserviceaccount.com', property: `sc-domain:${site.name}`, created_at: secs(c, c.nowAbs - 9000), last_ok_at: secs(c, c.nowAbs) } } : { connected: false })
    case 'insights': {
      // What moved: the sources that sent clearly more or fewer people than the period before.
      const r = reportOf(c, id, { ...parseQuery(sp), compare: 'previous', filters: [] })
      const was = new Map((r.previous?.dims.referrer ?? []).map((x) => [x.value, x.visitors]))
      const moves = (r.current.dims.referrer ?? []).map((x) => ({ value: x.value, now: x.visitors, was: was.get(x.value) ?? 0 })).filter((x) => x.now >= 20 && Math.abs(x.now - x.was) >= 20)
      moves.sort((a, b) => Math.abs(b.now - b.was) - Math.abs(a.now - a.was))
      return ok({ insights: moves.slice(0, 3).map((x) => ({ kind: 'source_move', dim: 'referrer', value: x.value, now: x.now, was: x.was, change: x.was ? (x.now - x.was) / x.was : 0 })) })
    }
    case 'report/pages-sell': {
      const q = parseQuery(sp)
      const by = new Map<string, { revenue: number; customers: number }>()
      for (const x of salesIn(c, site, dayIndex(c, q.from) * 1440, (dayIndex(c, q.to) + 1) * 1440, q.filters)) {
        const e = by.get(site.pages[x.page][0]) ?? { revenue: 0, customers: 0 }
        by.set(site.pages[x.page][0], { revenue: e.revenue + x.amt * 100, customers: e.customers + (x.amt > 0 ? 1 : 0) })
      }
      return ok({ pages: [...by.entries()].sort((a, b) => b[1].revenue - a[1].revenue).map(([value, e]) => ({ value, visitors: 0, ...e })) })
    }
    case 'segments':
      return ok(segments.list(id))
    case 'report/funnel':
      return ok(funnelOf(c, id, parseQuery(sp), JSON.parse(sp.get('steps') ?? '[]') as FunnelStep[]))
    case 'report/ai-search': {
      const bots = crawlersOf(c, id, parseQuery(sp)).series.filter((s) => s.kind === 'train')
      return ok({ visitors: 12, referrers: [{ value: 'chatgpt.com', visitors: 9 }, { value: 'perplexity.ai', visitors: 3 }], crawled: bots.reduce((n, s) => n + s.total, 0), bots: bots.map((s) => ({ name: s.name, kind: s.kind, hits: s.total })), pages: [], google: c.conn.search })
    }
    case 'report/crawlers':
      return ok(crawlersOf(c, id, parseQuery(sp)))
    case 'report/scroll': {
      const f = parseQuery(sp).filters.find((x) => x.dim === 'page')
      return ok(scrollOf(id, f?.value ?? site.pages[0][0]))
    }
    case 'heat':
      return ok(heatOf(c, id, parseQuery(sp), sp.get('path') ?? '/'))
    case 'report/goal-props':
      return ok(linksOf(c, id, parseQuery(sp)))
    case 'modules':
      return ok({ modules: MODULES.map((m) => ({ id: m, name: m, summary: '', collects: true, default_on: true, enabled: moduleOn(c, m) })), script: { bytes: 2068, core: 1650, full: 2091, url: '/js/fixture.js' } })
    case 'incidents': {
      const from = Number(sp.get('from') ?? 0)
      const to = Number(sp.get('to') ?? Number.MAX_SAFE_INTEGER)
      const list = incidentsOf(c, site).filter((i) => i.started_at <= to && (i.ended_at ?? Number.MAX_SAFE_INTEGER) >= from)
      const seconds = list.reduce((p, i) => p + Math.max(0, Math.min(i.ended_at ?? secs(c, c.nowAbs), to) - Math.max(i.started_at, from)), 0)
      return ok({ incidents: list, quiet_tracked: true, summary: { count: list.length, seconds, lost: list.reduce((p, i) => p + (i.expected_visits ?? 0), 0), lost_some: false } })
    }
    case 'events':
      return ok({ events: events(c, id, Number(sp.get('limit') ?? 20)) })
    case 'annotations':
      return ok({ annotations: notesOf(c, id).map((n) => ({ id: `note_${n.min}`, day: dateOf(c, Math.floor(n.min / 1440)), text: n.text, created_at: secs(c, n.min), author: 'albi@example.com' })) })
    case 'milestones': {
      // Told once, then kept in the list (as the server does): a milestone that was seen is still one, no longer new.
      const m = milestone(c, site)
      const fresh = !closed.has(id)
      const row = m ? { kind: 'visitors', step: String(m), value: m, day: dateOf(c, END), created_at: secs(c, c.nowAbs), new: fresh, shared: false } : null
      return ok({ enabled: true, milestones: row ? [row] : [], moment: row && fresh ? row : null })
    }
    case 'mentions': {
      const list = mentionsOf(c, id).map((x, i) => ({
        id: i + 1,
        source: x.src.startsWith('Hacker') ? 'hn' : 'news',
        url: `https://example.com/${i + 1}`,
        title: x.title,
        author: 'someone',
        host: x.src.startsWith('Hacker') ? 'news.ycombinator.com' : x.src.split(' ')[0].toLowerCase() + '.com',
        points: x.pts,
        comments: x.cm,
        front: x.pts > 100,
        posted_at: secs(c, x.min),
        found_at: secs(c, x.min),
        visitors: Math.round(x.pts * 0.7),
        driving: x.min >= END * 1440 && c.nowAbs - x.min < 600,
      }))
      return ok({ driving: list.find((x) => x.driving) ?? null, mentions: list, sources: ['hn', 'news'], words: { default: [site.name], added: [], max: 5 } })
    }
    case 'alerts':
      return ok({
        alerts: c.conn.alerts ? [{ id: 'alert_spike', site_id: id, kind: 'spike', enabled: true, target: 'albi@example.com', threshold: 2, last_fired: 0, created_at: secs(c, 0) }] : [],
        kinds: ['stopped', 'spike', 'customer', 'disk', 'weekly', 'milestone', 'surge', 'mention'],
        mail: true,
      })
    case 'usual': {
      // What is usual for the day: the same weekday's last four weeks, counted up to the same time of day.
      const q = parseQuery(sp)
      const d = dayIndex(c, q.from)
      const cut = d === END ? c.nowAbs - d * 1440 : 1440
      const at = (k: number) => countIn(c, id, (d - 7 * k) * 1440, (d - 7 * k) * 1440 + cut, q.filters)
      const weeks = [1, 2, 3, 4, 5, 6, 7, 8].map((k) => ({ day: dateOf(c, d - 7 * k), visitors: at(k) }))
      return ok({ visitors: at(0), average: Math.round(weeks.reduce((p, x) => p + x.visitors, 0) / weeks.length), weeks })
    }
    case 'now':
      return ok(nowOf(c, id))
    case 'busier':
      return ok(busierOf(c, id))
    case 'verified':
      return ok(siteJson(c, site).verified)
    case 'payments':
      return ok({
        connections: hasMoney(c, site) ? [{ id: 'pay_1', site_id: id, provider: 'stripe', mode: 'live', label: 'Stripe', managed: true, webhook_url: '', created_at: secs(c, 0), last_event_at: secs(c, c.nowAbs - 20), pending: 0, payments: c.w.data[id].sales.length, has_secret: true }] : [],
        providers: [{ id: 'stripe', name: 'Stripe', key_hint: 'rk_live_…', key_url: '', events: [], has_modes: true }],
        webhook_base: '',
      })
    case 'buyers': {
      const q = parseQuery(sp)
      const n = Number(sp.get('n') ?? 8)
      const list = salesIn(c, site, dayIndex(c, q.from) * 1440, (dayIndex(c, q.to) + 1) * 1440, q.filters)
        .filter((x) => x.amt > 0)
        .reverse()
        .slice(0, n)
        .map((x) => ({ id: `pay_${x.min}`, at: new Date(c.w.start + x.min * 60000).toISOString(), amount: x.amt * 100, kind: x.kind, channel: CHANNEL_OF[SRCS[x.s].id], referrer: REFS[SRCS[x.s].id], pages: [site.pages[x.page][0]] }))
      return ok({ buyers: list, currency: 'USD', exponent: 2 })
    }
    case 'sales':
      return ok({ sales: salesIn(c, site, END * 1440, c.nowAbs + 1, []) })
  }
  return null
}
