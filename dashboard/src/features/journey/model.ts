// One visitor's journey, turned into a story: who they are (the identity
// card) and, per visit, the nodes of a timeline. Pure functions only, so the
// grouping, collapsing and attribution are tested without a browser.
import type { JourneyResult, JourneyVisit } from '../../lib/api'
import { hueOf } from '../../lib/visitor'

/** Someone whose last event is this recent is on the site now (the same five
 *  minutes Live waits before a visitor leaves its list). */
export const LIVE_MS = 5 * 60 * 1000

export interface PageNode {
  kind: 'page'
  key: string
  at: number
  /** Seconds since the visit began. */
  offset: number
  path: string
  /** Consecutive views of the same path, folded into one node. */
  count: number
  engagedS: number
  exit: boolean
}

export interface GoalNode {
  kind: 'goal'
  key: string
  at: number
  offset: number
  goal: string
  props?: string
}

export interface PayNode {
  kind: 'payment'
  key: string
  at: number
  offset: number
  amount: number
  refunded: number
  provider: string
}

export type StoryNode = PageNode | GoalNode | PayNode

export interface VisitStory {
  key: string
  /** 1 is the first visit we know of. */
  number: number
  start: number
  end: number
  channel: string
  referrer: string
  country: string
  device: string
  browser: string
  os: string
  pageviews: number
  engagedS: number
  live: boolean
  nodes: StoryNode[]
}

export interface Identity {
  visitor: string
  hue: number
  visits: number
  firstSeen: number
  lastSeen: number
  returning: boolean
  totalS: number
  country: string
  device: string
  browser: string
  os: string
  live: boolean
  currentPath: string
  paid: number
  refunded: number
  /** The visit a sale is credited to: the last one that began before it. */
  source?: { channel: string; referrer: string }
}

export interface Story {
  identity: Identity
  visits: VisitStory[]
  truncated: boolean
}

type Payment = NonNullable<JourneyResult['payments']>[number]

const ms = (s: string) => new Date(s).getTime()

/** The visit a payment belongs to: the newest one that began before it, or
 *  the oldest when it predates every visit we hold. Visits are newest first. */
export function visitFor(visits: JourneyVisit[], at: number): number {
  for (let i = 0; i < visits.length; i++) {
    if (ms(visits[i].start) <= at) return i
  }
  return visits.length - 1
}

/** A visit's pageviews and goals as timeline nodes: consecutive views of one
 *  path folded together, the last page marked as the exit. */
export function nodesOf(v: JourneyVisit, payments: Payment[], vkey: string): StoryNode[] {
  const start = ms(v.start)
  const out: StoryNode[] = []
  // A visit whose events are all engagement pings arrives with none (null).
  const events = [...(v.events ?? [])].sort((a, b) => ms(a.at) - ms(b.at))
  events.forEach((e, i) => {
    const at = ms(e.at)
    const offset = Math.max(0, (at - start) / 1000)
    const key = `${vkey}-${i}`
    if (e.kind === 'goal') {
      out.push({ kind: 'goal', key, at, offset, goal: e.goal ?? '', props: e.props || undefined })
      return
    }
    const path = e.path ?? ''
    const last = out[out.length - 1]
    if (last && last.kind === 'page' && last.path === path) {
      last.count++
      last.engagedS += e.engaged_s ?? 0
      return
    }
    out.push({ kind: 'page', key, at, offset, path, count: 1, engagedS: e.engaged_s ?? 0, exit: false })
  })
  payments.forEach((p, i) => {
    const at = ms(p.at)
    out.push({ kind: 'payment', key: `${vkey}-pay-${i}`, at, offset: Math.max(0, (at - start) / 1000), amount: p.amount, refunded: p.refunded ?? 0, provider: p.provider })
  })
  out.sort((a, b) => a.at - b.at)
  fillTimeOnPage(out, ms(v.end))
  const exit = [...out].reverse().find((n): n is PageNode => n.kind === 'page')
  if (exit) exit.exit = true
  return out
}

// A page without engagement recorded gets the time until the next thing the
// visitor did, so every node can say how long they stayed.
function fillTimeOnPage(nodes: StoryNode[], end: number) {
  nodes.forEach((n, i) => {
    if (n.kind !== 'page' || n.engagedS > 0) return
    const next = nodes.slice(i + 1).find((m) => m.kind !== 'payment')
    const until = next ? next.at : end
    n.engagedS = Math.max(0, (until - n.at) / 1000)
  })
}

/** The whole story, visits newest first. */
export function buildStory(data: JourneyResult, now: number): Story {
  const raw = data.journey.visits
  const payments = data.payments ?? []
  const byVisit = new Map<number, Payment[]>()
  for (const p of payments) {
    const i = visitFor(raw, ms(p.at))
    byVisit.set(i, [...(byVisit.get(i) ?? []), p])
  }
  const visits: VisitStory[] = raw.map((v, i) => {
    const key = `v${raw.length - i}`
    const end = ms(v.end)
    return {
      key,
      number: raw.length - i,
      start: ms(v.start),
      end,
      channel: v.channel || 'Direct',
      referrer: v.referrer ?? '',
      country: v.country ?? '',
      device: v.device ?? '',
      browser: v.browser ?? '',
      os: v.os ?? '',
      pageviews: v.pageviews,
      engagedS: v.engaged_s,
      live: i === 0 && now - end < LIVE_MS,
      nodes: nodesOf(v, byVisit.get(i) ?? [], key),
    }
  })
  return { identity: identityOf(data, visits, payments), visits, truncated: !!data.journey.truncated }
}

function identityOf(data: JourneyResult, visits: VisitStory[], payments: Payment[]): Identity {
  const newest = visits[0]
  const oldest = visits[visits.length - 1]
  const first = data.journey.first_seen ? ms(data.journey.first_seen) : oldest?.start ?? 0
  const current = newest?.nodes.filter((n): n is PageNode => n.kind === 'page').pop()
  const firstPay = [...payments].sort((a, b) => ms(a.at) - ms(b.at))[0]
  const credited = firstPay ? visits[visitFor(data.journey.visits, ms(firstPay.at))] : undefined
  return {
    visitor: data.journey.visitor,
    hue: hueOf(data.journey.visitor),
    visits: visits.length,
    firstSeen: Math.min(first, oldest?.start ?? first),
    lastSeen: newest?.end ?? 0,
    // Seen before this history begins, or more than once in it.
    returning: visits.length > 1 || (!!oldest && first < oldest.start - 1000),
    totalS: visits.reduce((s, v) => s + v.engagedS, 0),
    country: newest?.country ?? '',
    device: newest?.device ?? '',
    browser: newest?.browser ?? '',
    os: newest?.os ?? '',
    live: newest?.live ?? false,
    currentPath: current?.path ?? '',
    paid: payments.reduce((s, p) => s + p.amount, 0),
    refunded: payments.reduce((s, p) => s + (p.refunded ?? 0), 0),
    source: credited ? { channel: credited.channel, referrer: credited.referrer } : undefined,
  }
}
