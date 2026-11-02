import { describe, expect, it } from 'vitest'
import type { Milestone, Site } from '../../lib/api'
import { fromFeed } from './notices'

const m = (over: Partial<Milestone>): Milestone => ({ kind: 'visitors', step: '1', value: 1, day: '2026-10-18', created_at: 1, new: true, ...over }) as Milestone
const sites = [{ id: 's1', domain: 'a.com' }] as Site[]
const rows = (list: Milestone[]) => list.map((milestone, i) => ({ id: `mile:s1:${i}`, kind: 'milestone' as const, site: 's1', at: 1, day: milestone.day, milestone }))

describe('milestone rows in the bell', () => {
  it('say what was reached in a sentence, never a raw key', () => {
    const [a, b, c] = fromFeed(rows([m({ kind: 'record_day', value: 317 }), m({ kind: 'pageviews', value: 1 }), m({ kind: 'revenue', value: 250, currency: 'USD' })]), sites, 9e9)
    expect(a.title).toBe('317 visitors in one day: your busiest yet.')
    expect(b.title).not.toMatch(/pageviews|\d+ pageviews/)
    expect(c.title).toContain('$250')
    for (const n of [a, b, c]) expect(n.title).not.toMatch(/record_day|Milestone:/)
  })
})
