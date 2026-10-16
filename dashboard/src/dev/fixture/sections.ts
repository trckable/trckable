// The answers Explore asks for beside the report: the funnel, the robots, the outbound links and the saved views. Dev only.
import type { CrawlerReport, FunnelResult, FunnelStep } from '../../lib/api'
import { siteOf, countIn, dayIndex, reportOf, type Ctx, type Query } from './report'

/** A funnel as the server answers it: each step counted from the people who reached the one before. */
export function funnelOf(c: Ctx, id: string, q: Query, steps: FunnelStep[]): { steps: FunnelResult[] } {
  const rep = reportOf(c, id, q).current
  const count = (s: FunnelStep) => {
    if (s.kind === 'goal') return rep.goals?.find((g) => g.value === s.value)?.visitors ?? 0
    return rep.dims.entry_page?.find((r) => r.value === s.value)?.visitors ?? 0
  }
  const out: FunnelResult[] = []
  steps.forEach((s, i) => {
    const raw = count(s)
    const v = i === 0 ? raw : Math.min(out[i - 1].visitors, raw)
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
]

export function crawlersOf(c: Ctx, id: string, q: Query): CrawlerReport {
  const v = reportOf(c, id, q).current.kpis.visitors
  const days = Math.max(1, dayIndex(c, q.to) - dayIndex(c, q.from) + 1)
  const series = BOTS.map(([name, share, kind]) => {
    const total = Math.round(v * share * 0.9)
    return { name, kind, total, values: Array.from({ length: days }, () => Math.round(total / days)) }
  })
  return { kinds: { index: 0, train: 0 }, series, pages: [], total: series.reduce((p, s) => p + s.total, 0), errors: 0, buckets: Array.from({ length: days }, (_, i) => `${i}`) }
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
