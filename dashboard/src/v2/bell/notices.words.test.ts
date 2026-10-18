import { describe, expect, it } from 'vitest'
import type { Milestone } from '../../lib/api'
import { fromMilestones } from './notices'

const m = (over: Partial<Milestone>): Milestone => ({ kind: 'visitors', step: '1', value: 1, day: '2026-10-18', created_at: 1, new: true, ...over }) as Milestone

describe('milestone rows in the bell', () => {
  it('say what was reached in a sentence, never a raw key', () => {
    const [a, b, c] = fromMilestones([m({ kind: 'record_day', value: 317 }), m({ kind: 'pageviews', value: 1 }), m({ kind: 'revenue', value: 250, currency: 'USD' })], 'a.com')
    expect(a.title).toBe('317 visitors in one day: your busiest yet.')
    expect(b.title).not.toMatch(/pageviews|\d+ pageviews/)
    expect(c.title).toContain('$250')
    for (const n of [a, b, c]) expect(n.title).not.toMatch(/record_day|Milestone:/)
  })
})
