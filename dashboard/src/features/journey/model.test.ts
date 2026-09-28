import { describe, expect, it } from 'vitest'
import type { JourneyResult, JourneyVisit } from '../../lib/api'
import { hueOf, truncateMiddle } from '../../lib/visitor'
import { buildStory, nodesOf, visitFor, type PageNode } from './model'

const at = (min: number) => new Date(Date.UTC(2026, 8, 27, 12, min)).toISOString()
const visit = (start: number, end: number, events: JourneyVisit['events'], extra: Partial<JourneyVisit> = {}): JourneyVisit => ({
  start: at(start),
  end: at(end),
  pageviews: (events ?? []).filter((e) => e.kind === 'pageview').length,
  engaged_s: 60,
  events,
  ...extra,
})
const pv = (min: number, path: string, engaged_s?: number) => ({ at: at(min), kind: 'pageview', path, engaged_s })

describe('nodesOf', () => {
  it('folds consecutive views of one path and marks the exit', () => {
    const v = visit(0, 10, [pv(0, '/'), pv(1, '/pricing', 20), pv(2, '/pricing', 10), pv(3, '/pricing'), pv(5, '/')])
    const nodes = nodesOf(v, [], 'v1') as PageNode[]
    expect(nodes.map((n) => [n.path, n.count])).toEqual([['/', 1], ['/pricing', 3], ['/', 1]])
    expect(nodes[1].engagedS).toBe(30)
    expect(nodes.map((n) => n.exit)).toEqual([false, false, true])
  })

  it('does not fold the same path across a goal', () => {
    const v = visit(0, 5, [pv(0, '/a'), { at: at(1), kind: 'goal', goal: 'Signup' }, pv(2, '/a')])
    expect(nodesOf(v, [], 'v').map((n) => n.kind)).toEqual(['page', 'goal', 'page'])
  })

  it('fills time on page from the next event when none was recorded', () => {
    const nodes = nodesOf(visit(0, 4, [pv(0, '/'), pv(2, '/b')]), [], 'v') as PageNode[]
    expect(nodes[0].engagedS).toBe(120)
    expect(nodes[1].engagedS).toBe(120)
    expect(nodes[0].offset).toBe(0)
    expect(nodes[1].offset).toBe(120)
  })

  it('places a payment in time order, after the exit page', () => {
    const nodes = nodesOf(visit(0, 5, [pv(0, '/'), pv(3, '/checkout')]), [{ at: at(4), amount: 900, kind: 'charge', provider: 'stripe' }], 'v')
    expect(nodes.map((n) => n.kind)).toEqual(['page', 'page', 'payment'])
    expect((nodes[1] as PageNode).exit).toBe(true)
  })

  it('takes a visit with no events (null)', () => {
    expect(nodesOf(visit(0, 1, null), [], 'v')).toEqual([])
  })
})

describe('visitFor', () => {
  const visits = [visit(30, 40, []), visit(0, 10, [])] // newest first
  it('credits the newest visit that began before', () => {
    expect(visitFor(visits, Date.parse(at(35)))).toBe(0)
    expect(visitFor(visits, Date.parse(at(20)))).toBe(1)
  })
  it('falls back to the oldest visit', () => {
    expect(visitFor(visits, Date.parse(at(-5)))).toBe(1)
  })
})

describe('buildStory', () => {
  const data: JourneyResult = {
    journey: {
      visitor: '7quilypk',
      first_seen: at(0),
      visits: [
        visit(30, 40, [pv(30, '/pricing')], { channel: 'Direct', country: 'AL' }),
        visit(0, 10, [pv(0, '/')], { channel: 'Search', referrer: 'google.com' }),
      ],
    },
    payments: [{ at: at(5), amount: 4900, refunded: 900, kind: 'charge', provider: 'stripe' }],
    currency: 'USD',
  }

  it('builds the identity card', () => {
    const s = buildStory(data, Date.parse(at(42)))
    expect(s.identity.visits).toBe(2)
    expect(s.identity.returning).toBe(true)
    expect(s.identity.paid).toBe(4900)
    expect(s.identity.refunded).toBe(900)
    expect(s.identity.source).toEqual({ channel: 'Search', referrer: 'google.com' })
    expect(s.identity.totalS).toBe(120)
    expect(s.identity.country).toBe('AL')
    expect(s.visits.map((v) => v.number)).toEqual([2, 1])
    expect(s.visits[1].nodes.some((n) => n.kind === 'payment')).toBe(true)
  })

  it('is live only while the last visit is recent', () => {
    expect(buildStory(data, Date.parse(at(42))).identity.live).toBe(true)
    expect(buildStory(data, Date.parse(at(46))).identity.live).toBe(false)
    expect(buildStory(data, Date.parse(at(42))).identity.currentPath).toBe('/pricing')
  })

  it('calls a single visit with no earlier sighting new', () => {
    const one: JourneyResult = { journey: { visitor: 'x', visits: [visit(0, 1, [pv(0, '/')])] } }
    const s = buildStory(one, Date.parse(at(60)))
    expect(s.identity.returning).toBe(false)
    expect(s.identity.source).toBeUndefined()
  })
})

describe('helpers', () => {
  it('truncates in the middle', () => {
    expect(truncateMiddle('/short')).toBe('/short')
    const t = truncateMiddle('/blog/2026/09/a-very-long-article-title-that-goes-on/comments', 20)
    expect(t).toHaveLength(20)
    expect(t.startsWith('/blog/2026')).toBe(true)
    expect(t.endsWith('comments')).toBe(true)
  })
  it('gives an id a stable hue', () => {
    expect(hueOf('7quilypk')).toBe(hueOf('7quilypk'))
    expect(hueOf('7quilypk')).toBeGreaterThanOrEqual(0)
    expect(hueOf('7quilypk')).toBeLessThan(360)
  })
})
