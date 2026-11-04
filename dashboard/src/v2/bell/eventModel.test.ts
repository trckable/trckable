import { describe, expect, it } from 'vitest'
import type { Story, VisitStory } from '../../features/journey/model'
import { fmtSpan, hasCard, TRAIL, trailTo, visitAt } from './eventModel'
import type { Notice } from './notices'

const page = (path: string, at: number) => ({ kind: 'page' as const, key: `${path}${at}`, at, offset: 0, path, count: 1, engagedS: 0, exit: false })
const visit = (key: string, start: number, end: number, nodes: VisitStory['nodes']): VisitStory => ({ key, number: 1, start, end, channel: 'Direct', referrer: '', country: 'DE', device: 'Desktop', browser: '', os: '', pageviews: nodes.length, engagedS: 0, more: 0, live: false, nodes })
const story = (visits: VisitStory[]): Story => ({ visits, truncated: false, identity: {} as Story['identity'] })
const n = (o: Partial<Notice>): Notice => ({ id: 'x', kind: 'goal', site: 'a.com', title: '', sub: '', at: 0, ...o })

describe('hasCard', () => {
  it('opens for the events with a concrete thing behind them', () => {
    for (const kind of ['goal', 'signup', 'sale', 'down', 'up', 'mention'] as const) expect(hasCard(n({ kind }))).toBe(true)
  })
  it('leaves busy rows, milestones, own handlers and the rest as they were', () => {
    expect(hasCard(n({ kind: 'spike', busy: { visitors: 1, factor: 2 } }))).toBe(false)
    expect(hasCard(n({ kind: 'goal', open: () => undefined }))).toBe(false)
    expect(hasCard(n({ kind: 'alert' }))).toBe(false)
    expect(hasCard(n({ kind: 'setup' }))).toBe(false)
  })
})

describe('visitAt', () => {
  const a = visit('a', 1000_000, 1100_000, [])
  const b = visit('b', 2000_000, 2100_000, [])
  it('finds the visit that was on at that second', () => {
    expect(visitAt(story([b, a]), 2050)?.key).toBe('b')
  })
  it('falls back to the newest visit that began before it', () => {
    expect(visitAt(story([b, a]), 1500)?.key).toBe('a')
  })
  it('names none when every visit began after it', () => {
    expect(visitAt(story([b, a]), 10)).toBeUndefined()
  })
})

describe('trailTo', () => {
  const v = visit('v', 0, 100_000, [page('/', 1000), page('/blog', 5000), page('/pricing', 9000), page('/signup', 20_000)])
  it('is the page it happened on and the way there, oldest first', () => {
    expect(trailTo(v, 10)).toEqual({ page: '/pricing', before: ['/', '/blog'], seen: 3 })
  })
  it('keeps only the last few pages', () => {
    const long = visit('l', 0, 1e6, Array.from({ length: 9 }, (_, i) => page(`/p${i}`, 1000 * (i + 1))))
    expect(trailTo(long, 100).before).toHaveLength(TRAIL)
    expect(trailTo(long, 100).page).toBe('/p8')
  })
})

describe('fmtSpan', () => {
  it('says a span the way people do', () => {
    expect(fmtSpan(30)).toBe('<1m')
    expect(fmtSpan(12 * 60)).toBe('12m')
    expect(fmtSpan(3 * 3600 + 5 * 60)).toBe('3h 5m')
    expect(fmtSpan(3 * 3600)).toBe('3h')
    expect(fmtSpan(47 * 3600 + 49 * 60)).toBe('1d 23h')
    expect(fmtSpan(2 * 86400)).toBe('2d')
  })
})
