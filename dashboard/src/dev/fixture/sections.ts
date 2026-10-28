// The answers Explore asks for beside the report: the funnel, the robots, the outbound links and the saved views. Dev only.
import type { CrawlerReport, FunnelResult, FunnelStep, PaidStep } from '../../lib/api'
import { hash, mulberry } from './rand'
import { siteOf, countIn, dayIndex, reportOf, type Ctx, type Query } from './report'

/** A funnel as the server answers it: each step counted from the people who reached the one before. */
export function funnelOf(c: Ctx, id: string, q: Query, steps: (FunnelStep | PaidStep)[]): { steps: FunnelResult[] } {
  const rep = reportOf(c, id, q).current
  const count = (s: FunnelStep | PaidStep) => {
    if (s.kind === 'paid') return Math.max(rep.money?.paying_visitors ?? 0, rep.money?.customers ?? 0)
    if (s.kind === 'goal') return rep.goals?.find((g) => g.value === s.value)?.visitors ?? 0
    return rep.dims.entry_page?.find((r) => r.value === s.value)?.visitors ?? 0
  }
  const out: FunnelResult[] = []
  steps.forEach((s, i) => {
    const raw = count(s)
    // The Show HN day: from the pricing page on, people leave more than usual (the walkthrough's "pricing starts leaking").
    const leak = c.w.key === 'hn' && i >= 2 && dayIndex(c, q.to) === Math.floor(c.nowAbs / 1440) ? 0.45 : 1
    const v = i === 0 ? raw : Math.round(Math.min(out[i - 1].visitors, raw) * (s.kind === 'paid' ? 1 : leak))
    const first = out[0]?.visitors ?? v
    out.push({ ...s, label: s.kind === 'goal' ? rep.goals?.find((g) => g.value === s.value)?.label : undefined, visitors: v, rate: i === 0 || !out[i - 1].visitors ? 1 : v / out[i - 1].visitors, of_total: first ? v / first : 0, median_s: 20 + i * 15, dropped: i === 0 ? 0 : out[i - 1].visitors - v })
  })
  return { steps: out }
}

const BOTS: [string, number, string][] = [
  ['Googlebot', 0.21, 'index'],
  ['GPTBot', 0.16, 'train'],
  ['ClaudeBot', 0.11, 'train'],
  ['Bingbot', 0.09, 'index'],
  ['AhrefsBot', 0.07, 'index'],
  ['OpenAI', 0.05, 'answer'],
]

/** The share of a robot's visits the fixture's CDN turns away: ChatGPT's answers, so the Briefing has its card. */
const BLOCKED: Record<string, number> = { OpenAI: 0.62, GPTBot: 0.04 }

export function crawlersOf(c: Ctx, id: string, q: Query): CrawlerReport {
  const v = reportOf(c, id, q).current.kpis.visitors
  const days = Math.max(1, dayIndex(c, q.to) - dayIndex(c, q.from) + 1)
  const series = BOTS.map(([name, share, kind]) => {
    const total = Math.round(v * share * 0.9)
    const blocked = Math.round(total * (BLOCKED[name] ?? 0))
    return { name, kind, total, blocked, errors: Math.round(total * 0.02), values: Array.from({ length: days }, () => Math.round(total / days)) }
  })
  return { kinds: { index: 0, train: 0 }, series, pages: [], total: series.reduce((p, s) => p + s.total, 0), blocked: series.reduce((p, s) => p + s.blocked, 0), errors: series.reduce((p, s) => p + s.errors, 0), buckets: Array.from({ length: days }, (_, i) => `${i}`) }
}

const LINKS: Record<string, [string, number][]> = {
  trk: [['github.com/trckable', 0.34], ['docs.trckable.com', 0.3], ['x.com/trckable', 0.16], ['producthunt.com', 0.12], ['paddle.com', 0.08]],
  shop: [['instagram.com', 0.4], ['pinterest.com', 0.25], ['paypal.com', 0.2], ['trustpilot.com', 0.15]],
  docs: [['github.com/trckable', 0.55], ['trckable.com', 0.3], ['stackoverflow.com', 0.15]],
  alb: [['instagram.com', 0.4], ['booking.com', 0.3], ['tripadvisor.com', 0.3]],
}

export function linksOf(c: Ctx, id: string, q: Query) {
  const v = countIn(c, id, dayIndex(c, q.from) * 1440, (dayIndex(c, q.to) + 1) * 1440, q.filters)
  return { properties: (LINKS[siteOf(id).id] ?? []).map(([value, share]) => ({ key: 'url', value, visitors: Math.round(v * share * 0.18) })) }
}

/** The saved views of this page: kept until the page is loaded again. */
const views: Record<string, { id: string; name: string; query: string }[]> = {}
export const segments = {
  list: (id: string) => ({ segments: views[id] ?? [] }),
  add: (id: string, body: { name: string; query: string }) => {
    const s = { id: `seg_${(views[id]?.length ?? 0) + 1}_${body.name}`, ...body }
    views[id] = [...(views[id] ?? []), s]
    return s
  },
  drop: (id: string, seg: string) => (views[id] = (views[id] ?? []).filter((x) => x.id !== seg)),
}

/** How far people read a page, as the walkthrough works it out (seeded by the page, so it is the same on every load). */
export function scrollOf(id: string, page: string) {
  const r = mulberry(hash(`${page}${id}sd`))
  const reached = [Math.round(82 + r() * 8), Math.round(60 + r() * 12), Math.round(38 + r() * 14), Math.round(18 + r() * 10)].map((x) => x / 100)
  return { samples: 120, avg: 52, reached }
}

/** Where people click on a page: a few elements, each a share of the page's views. */
export function heatOf(c: Ctx, id: string, q: Query, path: string) {
  const views = countIn(c, id, dayIndex(c, q.from) * 1440, (dayIndex(c, q.to) + 1) * 1440, [{ dim: 'entry_page', not: false, value: path }])
  const r = mulberry(hash(`${path}${id}heat`))
  const spots = ['a.nav', 'button.cta', 'a.pricing', 'a.docs'].map((el, i) => ({ el, cx: Math.floor(r() * 10), cy: Math.floor(r() * 10), n: Math.round(views * (0.25 - i * 0.05) * (0.6 + r() * 0.5)), x: 80 + Math.round(r() * 700), y: 60 + i * 340, w: 120 + Math.round(r() * 120), h: 44 }))
  return { path, width: 1280, widths: [{ width: 1280, views }], views, window: 1280, height: 3000, clicks: views ? spots : [], dead: [], rage: [], elements: [], fields: [], scroll: [1, 0.9, 0.78, 0.6, 0.5, 0.42, 0.34, 0.27, 0.2, 0.14], scroll_views: views }
}
