import { describe, expect, it } from 'vitest'
import { ago, peopleOf, span } from './peopleModel'

const ev = (visitor: string, session: string, ts: string, path: string, extra = {}) => ({ visitor, session, ts, kind: 'pageview', path, channel: 'Search', country: 'DE', device: 'Mobile', ...extra })

describe('the people card', () => {
  it('makes one person of a visit: its entry page, its pages and how long', () => {
    // newest first, as the server sends them
    const events = [ev('a', 's1', '2026-09-30T10:03:00Z', '/pricing'), ev('a', 's1', '2026-09-30T10:01:30Z', '/docs'), ev('a', 's1', '2026-09-30T10:00:00Z', '/')]
    const [p] = peopleOf(events)
    expect(p.path).toBe('/')
    expect(p.pages).toBe(3)
    expect(p.seconds).toBe(180)
    expect(p.last).toBe(Date.parse('2026-09-30T10:03:00Z'))
    expect(p.channel).toBe('Search')
  })

  it('lists each visitor once, newest first, and at most the limit', () => {
    const events = [ev('a', 's2', '2026-09-30T11:00:00Z', '/a'), ev('b', 's3', '2026-09-30T10:50:00Z', '/b'), ev('a', 's1', '2026-09-30T09:00:00Z', '/old')]
    expect(peopleOf(events).map((p) => p.visitor)).toEqual(['a', 'b'])
    expect(peopleOf(events, 1)).toHaveLength(1)
  })

  it('names a goal when that is all there is', () => {
    const [p] = peopleOf([{ visitor: 'a', session: 's', ts: '2026-09-30T10:00:00Z', kind: 'goal', goal: 'signup' }])
    expect(p.path).toBe('signup')
    expect(p.pages).toBe(0)
  })

  it('writes the time since and the length of a visit short', () => {
    expect(ago(5_000)).toBe('now')
    expect(ago(3 * 60_000)).toBe('3m')
    expect(ago(2 * 3600_000)).toBe('2h')
    expect(ago(3 * 86400_000)).toBe('3d')
    expect(span(45)).toBe('45s')
    expect(span(125)).toBe('2m')
  })
})
