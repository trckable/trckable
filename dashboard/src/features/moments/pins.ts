// What the server found, as pins: one shape for a moment on the chart (the
// markers) and a finding in the card on opening (one thing today), so the two
// say the same words. A pin knows how much it matters (score), the day it
// belongs to, and the filter a click applies. Nothing here fetches or draws.
// Pure: pins.test.ts.
import type { Filter, Milestone } from '../../lib/api'
import type { Insight } from '../extras/extrasApi'
import type { Moment } from '../story/moments'

export type PinKind = 'spike' | 'sale' | 'referrer' | 'drop' | 'milestone' | 'ai' | 'move' | 'pays'

export interface Pin {
  id: string
  kind: PinKind
  /** How much it matters: the higher, the sooner it is shown. */
  score: number
  /** The day it belongs to ("2026-09-19"): where its marker sits. Findings about the whole period have none. */
  day?: string
  /** The chart bucket it happened in ("2026-09-19T20:00"), when the server says so by the hour. */
  at?: string
  /** What a click narrows the numbers to. */
  filters: Filter[]
  /** A click also shows the day itself (a spike, a sale, a milestone), not only the filter. */
  showDay: boolean
  /** The figures, as the server gave them. */
  n: Figures
}

export interface Figures {
  /** A source, a page, a referrer or an assistant. */
  name?: string
  visitors?: number
  factor?: number
  count?: number
  amount?: number
  channel?: string
  referrer?: string
  was?: number
  change?: number
  rate?: number
  wasRate?: number
  perVisitor?: number
  times?: number
  family?: Milestone['kind']
  value?: number
  currency?: string
}

const day = (t: string) => t.slice(0, 10)

/** The moments a chart shows: spikes, sales, an AI assistant's first visit and milestones (a country's first and notes have their own places). Money moments only where the reader may see revenue. */
export function pinsFromMoments(list: Moment[], money: boolean): Pin[] {
  const biggest = Math.max(1, ...list.filter((m) => m.kind === 'sale').map((m) => m.amount ?? 0))
  const out: Pin[] = []
  for (const m of list) {
    // A milestone is its family and step (several are reached on one day); the others are told apart by their bucket.
    const base = { id: m.kind === 'milestone' ? `milestone:${m.family}:${m.step}` : `${m.kind}:${m.t}`, day: day(m.t), at: m.t }
    switch (m.kind) {
      case 'spike':
        out.push({ ...base, kind: 'spike', score: 80 + Math.min(15, m.factor ?? 0), filters: m.referrer ? [{ dim: 'referrer', value: m.referrer }] : [], showDay: true, n: { factor: m.factor, visitors: m.visitors, referrer: m.referrer } })
        break
      case 'sale':
        if (money) out.push({ ...base, kind: 'sale', score: 60 + 20 * ((m.amount ?? 0) / biggest), filters: m.channel ? [{ dim: 'channel', value: m.channel }] : [], showDay: true, n: { count: m.count, amount: m.amount, channel: m.channel } })
        break
      case 'ai':
        out.push({ ...base, kind: 'ai', score: 55, filters: [{ dim: 'channel', value: 'AI' }], showDay: false, n: { name: m.bot } })
        break
      case 'milestone':
        if (money || (m.family !== 'revenue' && m.family !== 'first_sale')) out.push({ ...base, kind: 'milestone', score: 75, filters: [], showDay: true, n: { family: m.family as Milestone['kind'], value: m.value, currency: m.currency } })
        break
    }
  }
  return out
}

/** One pin per id (a milestone is its family and step, a spike its bucket), the earliest day kept: the same thing told twice is still one. */
export function dedupePins(list: Pin[]): Pin[] {
  const seen = new Map<string, Pin>()
  for (const p of list) {
    const was = seen.get(p.id)
    if (!was || (p.day ?? '') < (was.day ?? '')) seen.set(p.id, p)
  }
  return [...seen.values()]
}

/** The findings that have a day (a new referrer's first visit, the day a page's buyers fell away) sit on the chart; the others are for the card on opening. */
export function pinsFromInsights(list: Insight[]): Pin[] {
  return list.map((i): Pin => {
    const id = `${i.kind}:${i.value}`
    const filters = [{ dim: i.dim, value: i.value }]
    switch (i.kind) {
      case 'source_move':
        return { id, kind: 'move', score: 70 + Math.min(20, Math.abs(i.change ?? 0) * 10), filters, showDay: false, n: { name: i.value, visitors: i.now, was: i.was, change: i.change } }
      case 'top_revenue':
        return { id, kind: 'pays', score: 65, filters, showDay: false, n: { name: i.value, visitors: i.now, perVisitor: i.per_visitor, times: i.times } }
      case 'conversion_drop':
        return { id, kind: 'drop', score: 90 + Math.min(10, Math.abs(i.change ?? 0) * 10), day: i.since, filters, showDay: false, n: { name: i.value, visitors: i.now, rate: i.rate, wasRate: i.was_rate } }
      default:
        return { id, kind: 'referrer', score: 40 + Math.min(22, Math.log10(Math.max(1, i.now)) * 7), day: i.since, filters, showDay: false, n: { name: i.value, visitors: i.now } }
    }
  })
}

/** Milestones the person has not yet seen: the server keeps who saw which. */
export function pinsFromMilestones(list: Milestone[]): Pin[] {
  return list
    .filter((m) => m.new)
    .map((m) => ({ id: `milestone:${m.kind}:${m.step}`, kind: 'milestone', score: 75, day: m.day, filters: [], showDay: true, n: { family: m.kind, value: m.value, currency: m.currency } }))
}

/** Most important first; the same score keeps the later day first. */
export const byScore = (a: Pin, b: Pin) => b.score - a.score || (b.day ?? '').localeCompare(a.day ?? '') || a.id.localeCompare(b.id)
