// The API a fixture answers with, by path. Anything it does not know answers 404, and says so in the console. Dev only.
import type { Site, VerifiedSource } from '../../lib/api'
import { CTYS, DEVS, END, GSC, SITES, SRCS, type SiteDef } from './data'
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
import { hash, mulberry, pick } from './rand'
import { osOf, visitsOf, BROWSERS } from './visits'

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
  const created = v.n === 0 ? secs(c, c.nowAbs - 25) : since
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
    created_at: created,
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
  const rows = GSC[id] ?? []
  const q = parseQuery(sp)
  const g = reportOf(c, id, { ...q, filters: [{ dim: 'referrer', not: false, value: 'google.com' }] }).current.kpis.visitors
  const dim = sp.get('dim') === 'page' ? 'page' : 'query'
  const list = rows.map(([key, share, pos, ctr]) => {
    const clicks = Math.round(g * share)
    return { key, clicks, impressions: Math.round(clicks / Math.max(ctr, 0.005)), ctr, position: pos }
  })
  return { property: `sc-domain:${siteOf(id).name}`, dim, rows: dim === 'query' ? list : null, from: q.from, to: q.to, clicks: list.reduce((p, x) => p + x.clicks, 0), impressions: list.reduce((p, x) => p + x.impressions, 0), preliminary_from: dateOf(c, END - 1), ignored_filters: null }
}

export function answer(c: Ctx, method: string, path: string, sp: URLSearchParams): Reply | null {
  if (method !== 'GET') return none()
  const sites = SITES
  switch (path) {
    case '/setup':
      return ok({ email_codes: false, needs_setup: false, sso: [] })
    case '/me':
      return ok({ kind: 'user', email: 'albi@example.com', role: 'owner', operator: true, version: '0.7.23', keys: {}, update_check: false, must_change: false })
    case '/account':
      return ok({ email: 'albi@example.com', name: 'Albi', has_avatar: false })
    case '/sites':
      return ok({ sites: sites.map((s) => siteJson(c, s)) })
    case '/site-layout':
      return ok({ order: [], pinned: [], groups: [] })
    case '/overview': {
      const days = Number(sp.get('days') ?? 30)
      const d2 = END
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
      return ok(c.conn.search ? { connected: true, connection: { client_email: 'trckable@fixture.iam.gserviceaccount.com', property: `sc-domain:${site.name}`, created_at: secs(c, c.nowAbs - 9000) } } : { connected: false })
    case 'segments':
      return ok({ segments: [] })
    case 'modules':
      return ok({ modules: [], script: { size: 0, gz: 0 } })
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
      const m = milestone(c, site)
      const moment = m ? { kind: 'visitors', step: String(m), value: m, day: dateOf(c, END), created_at: secs(c, c.nowAbs), new: true, shared: false } : null
      return ok({ enabled: true, milestones: moment ? [moment] : [], moment })
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
      const weeks = [1, 2, 3, 4].map((k) => ({ day: dateOf(c, d - 7 * k), visitors: at(k) }))
      return ok({ visitors: at(0), average: Math.round(weeks.reduce((p, x) => p + x.visitors, 0) / weeks.length), weeks })
    }
    case 'now':
      return ok(nowOf(c, id))
    case 'busier':
      return ok(busierOf(c, id))
    case 'verified':
      return ok(siteJson(c, site).verified)
    case 'payments':
      return ok({ connections: hasMoney(c, site) ? [{ id: 'pay_1', provider: 'stripe', mode: 'live', status: 'ok' }] : [], providers: [], webhook_base: '' })
    case 'sales':
      return ok({ sales: salesIn(c, site, END * 1440, c.nowAbs + 1, []) })
  }
  return null
}
