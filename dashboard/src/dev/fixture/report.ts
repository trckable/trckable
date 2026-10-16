// The report API's answers, counted from a fixture's visitors the way the server counts them. Dev only.
import type { Bucket, Day, Money, Point, Report, Result, Row } from '../../lib/api'
import { CTYS, DEVS, NH, NS, SITES, SRCS, type SiteDef } from './data'
import type { Sale, World } from './engine'
import { hash, mulberry } from './rand'
import { BROWSERS, goalsOf, osOf, slug, visitsOf, type Visits } from './visits'

export interface Conn {
  rev: boolean
  search: boolean
  goals: boolean
  uptime: boolean
  alerts: boolean
}

export interface Ctx {
  w: World
  /** The fixture's "now", in minutes from the first day's midnight. */
  nowAbs: number
  conn: Conn
}

export interface Flt {
  dim: string
  not: boolean
  value: string
}

export interface Query {
  from: string
  to: string
  bucket?: string
  compare?: string
  filters: Flt[]
}

/** The host each source arrives from (none for a visit with no referrer). */
export const REFS: Record<string, string> = {
  google: 'google.com',
  direct: '',
  hn: 'news.ycombinator.com',
  reddit: 'reddit.com',
  x: 't.co',
  newsletter: 'substack.com',
  chatgpt: 'chatgpt.com',
  github: 'github.com',
  badge: 'trckable.com',
}
const CHANNEL: Record<string, string> = { google: 'Search', direct: 'Direct', hn: 'Referral', reddit: 'Social', x: 'Social', newsletter: 'Email', chatgpt: 'Referral', github: 'Referral', badge: 'Referral' }

export const siteOf = (id: string): SiteDef => {
  const s = SITES.find((x) => x.id === id)
  if (!s) throw new Error(`fixture: no site ${id}`)
  return s
}
export const hasMoney = (c: Ctx, s: SiteDef): boolean => c.conn.rev && !!s.money

export const dayIndex = (c: Ctx, date: string): number => Math.round((Date.parse(`${date}T00:00:00Z`) - c.w.start) / 864e5)
export const dateOf = (c: Ctx, d: number): string => new Date(c.w.start + d * 864e5).toISOString().slice(0, 10)
const pad = (n: number) => String(n).padStart(2, '0')
const label = (c: Ctx, min: number, bucket: Bucket): string => {
  const d = Math.floor(min / 1440)
  return bucket === 'hour' ? `${dateOf(c, d)}T${pad(Math.floor((min % 1440) / 60))}:00` : `${dateOf(c, d)}T00:00`
}

type Test = (v: Visits, i: number) => boolean

/** A filter as a test on one visitor. */
function testOf(site: SiteDef, f: Flt): Test | null {
  const yes = (t: Test): Test => (f.not ? (v, i) => !t(v, i) : t)
  switch (f.dim) {
    case 'referrer':
      return yes((v, i) => (REFS[SRCS[v.s[i]].id] || '') === f.value)
    case 'channel':
      return yes((v, i) => CHANNEL[SRCS[v.s[i]].id] === f.value)
    case 'country':
      return yes((v, i) => CTYS[v.cty[i]].id === f.value)
    case 'device':
      return yes((v, i) => DEVS[v.dev[i]].name === f.value)
    case 'browser':
      return yes((v, i) => BROWSERS[v.br[i]] === f.value)
    case 'os':
      return yes((v, i) => osOf(v.dev[i], v.br[i]) === f.value)
    case 'entry_page':
      return yes((v, i) => site.pages[v.pg[i]][0] === f.value)
    case 'goal': {
      const gi = goalsOf(site).findIndex((g) => g.key === f.value)
      return gi < 0 ? null : yes((v, i) => (v.goals[i] & (1 << gi)) !== 0)
    }
    default:
      return null
  }
}

/** The same filter on a sale. */
function saleTest(f: Flt, site: SiteDef): ((x: Sale) => boolean) | null {
  const yes = (t: (x: Sale) => boolean) => (f.not ? (x: Sale) => !t(x) : t)
  switch (f.dim) {
    case 'referrer':
      return yes((x) => (REFS[SRCS[x.s].id] || '') === f.value)
    case 'channel':
      return yes((x) => CHANNEL[SRCS[x.s].id] === f.value)
    case 'country':
      return yes((x) => CTYS[x.cty].id === f.value)
    case 'device':
      return yes((x) => DEVS[x.dev].name === f.value)
    case 'entry_page':
      return yes((x) => site.pages[x.page][0] === f.value)
    default:
      return null
  }
}

interface Acc {
  visitors: number
  pageviews: number
  bounced: number
  dur: number
}
const acc = (): Acc => ({ visitors: 0, pageviews: 0, bounced: 0, dur: 0 })
const row = (value: string, a: Acc): Row => ({ value, visitors: a.visitors, sessions: a.visitors, pageviews: a.pageviews, bounce_rate: a.visitors ? a.bounced / a.visitors : 0 })

export function salesIn(c: Ctx, site: SiteDef, a: number, b: number, filters: Flt[]): Sale[] {
  const tests = filters.flatMap((f) => saleTest(f, site) ?? [])
  return c.w.data[site.id].sales.filter((x) => x.min >= a && x.min < Math.min(b, c.nowAbs + 1e-6) && tests.every((t) => t(x)))
}

export function money(sales: Sale[], visitors: number): Money {
  const pos = sales.filter((x) => x.amt > 0)
  const rev = sales.reduce((p, x) => p + x.amt, 0) * 100
  const news = pos.filter((x) => x.kind === 'new')
  const sum = (k: string) => pos.filter((x) => x.kind === k).reduce((p, x) => p + x.amt, 0) * 100
  return {
    currency: 'USD',
    exponent: 2,
    revenue: rev,
    refunds: sales.filter((x) => x.amt < 0).reduce((p, x) => p - x.amt, 0) * 100,
    payments: pos.length,
    customers: news.length,
    paying_visitors: pos.length,
    conversion: visitors ? pos.length / visitors : 0,
    revenue_per_visitor: visitors ? rev / visitors : 0,
    new_revenue: sum('new'),
    renewal_revenue: sum('renewal'),
    unattributed: 0,
    unconverted: 0,
  }
}

/** The goal the Briefing's second card is about: the funnel step the mock picks, by the name the mock gives it. */
export function kpiGoal(c: Ctx, site: SiteDef): { key: string; label: string } {
  const funnel = hasMoney(c, site) || !site.money ? site.funnel : site.funnel.slice(0, site.rates.length + 1)
  const i = Math.min(site.kpi, funnel.length - 1)
  const named = hasMoney(c, site) ? site.kpiName : site.kpiFree
  return { key: slug(funnel[i]), label: named || funnel[i] }
}

function resultOf(c: Ctx, v: Visits, a: number, b: number, bucket: Bucket, filters: Flt[]): Result {
  const site = v.site
  const tests = filters.flatMap((f) => testOf(site, f) ?? [])
  const step = bucket === 'hour' ? 60 : 1440
  const nb = Math.max(1, Math.round((b - a) / step))
  const per: Acc[] = Array.from({ length: nb }, acc)
  const tot = acc()
  const dims: Record<string, Map<string, Acc>> = { browser: new Map(), channel: new Map(), country: new Map(), device: new Map(), entry_page: new Map(), os: new Map(), referrer: new Map(), page: new Map() }
  const goalN = new Array<number>(v.list.length).fill(0)
  const bump = (m: Map<string, Acc>, k: string, np: number, bounced: number) => {
    let x = m.get(k)
    if (!x) m.set(k, (x = acc()))
    x.visitors++
    x.pageviews += np
    x.bounced += bounced
  }
  const pages = new Map<string, number>()
  for (let i = 0; i < v.n; i++) {
    const t = v.t[i]
    if (t < a || t >= b) continue
    if (!tests.every((f) => f(v, i))) continue
    const p = per[Math.min(nb - 1, Math.floor((t - a) / step))]
    for (const x of [p, tot]) {
      x.visitors++
      x.pageviews += v.np[i]
      x.bounced += v.bounced[i]
      x.dur += v.dur[i]
    }
    const s = v.s[i]
    const id = SRCS[s].id
    bump(dims.browser, BROWSERS[v.br[i]], v.np[i], v.bounced[i])
    bump(dims.channel, CHANNEL[id], v.np[i], v.bounced[i])
    bump(dims.country, CTYS[v.cty[i]].id, v.np[i], v.bounced[i])
    bump(dims.device, DEVS[v.dev[i]].name, v.np[i], v.bounced[i])
    bump(dims.entry_page, site.pages[v.pg[i]][0], v.np[i], v.bounced[i])
    bump(dims.os, osOf(v.dev[i], v.br[i]), v.np[i], v.bounced[i])
    if (REFS[id]) bump(dims.referrer, REFS[id], v.np[i], v.bounced[i])
    // The pages read: the one it came in on, and the others by the source's own taste.
    pages.set(site.pages[v.pg[i]][0], (pages.get(site.pages[v.pg[i]][0]) ?? 0) + 1)
    if (v.np[i] > 1) site.pages.forEach(([name], k) => pages.set(name, (pages.get(name) ?? 0) + (v.np[i] - 1) * site.pg[s][k]))
    for (let g = 0; g < goalN.length; g++) if (v.goals[i] & (1 << g)) goalN[g]++
  }
  const points: Point[] = per.map((x, i) => {
    const p: Point = { t: label(c, a + i * step, bucket), visitors: x.visitors, pageviews: x.pageviews }
    if (x.visitors) {
      p.bounce_rate = x.bounced / x.visitors
      p.avg_session_s = x.dur / x.visitors
    }
    return p
  })
  const rows = (m: Map<string, Acc>): Row[] =>
    [...m.entries()]
      .map(([k, x]) => row(k, x))
      .sort((p, q) => q.visitors - p.visitors)
  const pageRows: Row[] = [...pages.entries()]
    .map(([value, pv]): Row => ({ value, visitors: Math.round(pv * 0.8), pageviews: Math.round(pv) }))
    .sort((p, q) => (q.pageviews ?? 0) - (p.pageviews ?? 0))
  const d: Record<string, Row[] | null> = { browser: rows(dims.browser), campaign: [], channel: rows(dims.channel), country: rows(dims.country), device: rows(dims.device), entry_page: rows(dims.entry_page), os: rows(dims.os), page: pageRows, referrer: rows(dims.referrer) }
  const goals: Row[] = v.list.map((g, gi) => ({ value: g.key, label: g.label, visitors: goalN[gi], pageviews: goalN[gi] }))
  const out: Result = {
    approximate: false,
    kpis: {
      visitors: tot.visitors,
      sessions: tot.visitors,
      pageviews: tot.pageviews,
      bounce_rate: tot.visitors ? tot.bounced / tot.visitors : 0,
      avg_session_s: tot.visitors ? tot.dur / tot.visitors : 0,
      views_per_session: tot.visitors ? tot.pageviews / tot.visitors : 0,
      new_visitor_share: 0,
    },
    series: points,
    dims: d,
    goals: [],
  }
  // The goal the second card tells (see kpiGoal) leads; a site that sells counts its sales as the last step.
  const lead = kpiGoal(c, site)
  const sales = hasMoney(c, site) ? salesIn(c, site, a, b, filters) : []
  if (hasMoney(c, site)) {
    out.money = money(sales, tot.visitors)
    sales.forEach((x) => {
      const i = Math.min(nb - 1, Math.floor((x.min - a) / step))
      points[i].revenue = (points[i].revenue ?? 0) + x.amt * 100
    })
    points.forEach((p) => (p.revenue ??= 0))
    goals.push({ value: slug(site.funnel[site.funnel.length - 1]), label: site.funnel[site.funnel.length - 1], visitors: sales.filter((x) => x.kind === 'new').length, pageviews: 0 })
  }
  const leadRow = goals.find((g) => g.value === lead.key) ?? goals.find((g) => g.label === lead.label)
  if (leadRow) leadRow.label = lead.label
  out.goals = c.conn.goals ? [...(leadRow ? [leadRow] : []), ...goals.filter((g) => g !== leadRow)] : []
  return out
}

export function parseQuery(sp: URLSearchParams): Query {
  const filters = sp.getAll('f').flatMap((raw): Flt[] => {
    const i = raw.indexOf(':')
    if (i <= 0) return []
    const head = raw.slice(0, i)
    const not = head.endsWith('!')
    return [{ dim: not ? head.slice(0, -1) : head, not, value: raw.slice(i + 1) }]
  })
  return { from: sp.get('from') ?? '', to: sp.get('to') ?? '', bucket: sp.get('bucket') ?? undefined, compare: sp.get('compare') ?? undefined, filters }
}

export function bucketFor(days: number, asked?: string): Bucket {
  if (asked === 'hour' || asked === 'day') return asked
  return days <= 2 ? 'hour' : 'day'
}

export function reportOf(c: Ctx, siteId: string, q: Query): Report {
  const site = siteOf(siteId)
  const v = visitsOf(c.w, siteId, c.nowAbs)
  const d1 = dayIndex(c, q.from)
  const d2 = dayIndex(c, q.to)
  const days = d2 - d1 + 1
  const bucket = bucketFor(days, q.bucket)
  const cur = resultOf(c, v, d1 * 1440, (d2 + 1) * 1440, bucket, q.filters)
  const rep: Report = { site: siteId, timezone: 'UTC', bucket, from: q.from, to: q.to, current: cur, online: online(c, site), bots: { total: 0, kinds: {} } }
  if (q.compare === 'previous') {
    const p1 = d1 - days
    rep.previous = resultOf(c, v, p1 * 1440, d1 * 1440, bucket, q.filters)
    rep.previous_from = dateOf(c, p1)
    rep.previous_to = dateOf(c, d1 - 1)
  }
  return rep
}

/** Days of one site, for the all-sites view and its sparklines. */
export function dailyOf(c: Ctx, siteId: string, d1: number, d2: number): Day[] {
  const rep = reportOf(c, siteId, { from: dateOf(c, d1), to: dateOf(c, d2), bucket: 'day', filters: [] })
  return rep.current.series.map((p, i) => ({ date: dateOf(c, d1 + i), kpis: { ...rep.current.kpis, visitors: p.visitors, sessions: p.visitors, pageviews: p.pageviews }, dims: {} }))
}

/** What the mock calls "now online": the last five minutes' share of the hour, a little uneven. */
export function online(c: Ctx, site: SiteDef): number {
  const d = c.w.data[site.id]
  if (d.inc.some((i) => c.nowAbs >= i.a && c.nowAbs < i.b)) return 0
  let t = 0
  for (let k = 0; k < 5; k++) {
    const m = Math.floor(c.nowAbs) - k
    if (m < 0 || m >= NH * 60) continue
    if (d.inc.some((i) => m >= i.a && m < i.b)) continue
    let hv = 0
    for (let s = 0; s < NS; s++) hv += d.H[Math.floor(m / 60) * NS + s]
    t += (hv / 60) * (0.7 + 0.6 * mulberry(hash(`${site.id}:${m}:${c.w.seed}`))())
  }
  return Math.round(t * 1.6)
}

