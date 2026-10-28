import { describe, expect, it } from 'vitest'
import type { Result } from '../../lib/api'
import { figuresOf } from './numbers'

const result = (o: { visitors?: number; sessions?: number; bounce?: number; sec?: number; money?: Partial<NonNullable<Result['money']>> } = {}): Result =>
  ({
    approximate: false,
    kpis: { visitors: o.visitors ?? 100, sessions: o.sessions ?? 120, pageviews: 300, bounce_rate: o.bounce ?? 0.5, avg_session_s: o.sec ?? 90, views_per_session: 2, new_visitor_share: 0.5 },
    series: [],
    dims: {},
    goals: null,
    ...(o.money ? { money: { revenue: 10_000, revenue_per_visitor: 100, conversion: 0.02, ...o.money } } : {}),
  }) as Result

const usd = (n: number) => `$${n / 100}`

describe('the numbers row', () => {
  it('has the three site figures without payments', () => {
    expect(figuresOf(result(), result(), usd).map((f) => f.key)).toEqual(['visitors', 'bounce', 'session'])
  })
  it('adds revenue, conversion and revenue per visitor when payments are connected, and not when no money writer is given', () => {
    expect(figuresOf(result({ money: {} }), result(), usd).map((f) => f.key)).toEqual(['visitors', 'revenue', 'conversion', 'perVisitor', 'bounce', 'session'])
    expect(figuresOf(result({ money: {} }), result()).map((f) => f.key)).toEqual(['visitors', 'bounce', 'session'])
  })
  it('says the change against the period before, and a rise in bounce rate is the worse one', () => {
    const [v, b] = figuresOf(result({ visitors: 129, bounce: 0.6 }), result({ visitors: 100, bounce: 0.5 }))
    expect(v.change?.short).toBe('29% ↑')
    expect(b.change?.short).toBe('20% ↑')
    expect(b.change?.verdict).toBe('worse')
  })
  it('shows no change without a base, and dashes the rates while there are too few visits', () => {
    const f = figuresOf(result({ sessions: 5 }), result({ visitors: 3 }))
    expect(f[0].change).toBeNull()
    expect([f[1].val, f[2].val]).toEqual(['–', '–'])
  })
})
