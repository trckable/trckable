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

const withSignup = (r: Result, visitors: number): Result => ({ ...r, signup: { goal: 'signup', visitors } })

const usd = (n: number) => `$${n / 100}`

describe('the numbers row', () => {
  it('has the four site figures without payments', () => {
    expect(figuresOf(result(), result(), usd).map((f) => f.key)).toEqual(['visitors', 'pageviews', 'bounce', 'session'])
  })
  it('adds revenue and conversion when payments are connected, and not when no money writer is given', () => {
    expect(figuresOf(result({ money: {} }), result(), usd).map((f) => f.key)).toEqual(['visitors', 'pageviews', 'revenue', 'conversion', 'bounce', 'session'])
    expect(figuresOf(result({ money: {} }), result()).map((f) => f.key)).toEqual(['visitors', 'pageviews', 'bounce', 'session'])
  })
  it('says the change against the period before, and a rise in bounce rate is the worse one', () => {
    const [v, , b] = figuresOf(result({ visitors: 129, bounce: 0.6 }), result({ visitors: 100, bounce: 0.5 }))
    expect(v.change?.short).toBe('29% ↑')
    expect(b.change?.short).toBe('20% ↑')
    expect(b.change?.verdict).toBe('worse')
  })
  it('shows no change without a base, and dashes the rates while there are too few visits', () => {
    const f = figuresOf(result({ sessions: 5 }), result({ visitors: 3 }))
    expect(f[0].change).toBeNull()
    expect([f[2].val, f[3].val]).toEqual(['–', '–'])
  })
  it('adds Signups and the signup rate after the traffic figures when the site has a signup goal, and not without one', () => {
    expect(figuresOf(withSignup(result(), 10), result()).map((f) => f.key)).toEqual(['visitors', 'pageviews', 'signups', 'signupRate', 'bounce', 'session'])
    expect(figuresOf(result(), result()).map((f) => f.key)).not.toContain('signups')
  })
  it('counts the rate as signups over visitors and says each change against the period before', () => {
    const [, , su, rt] = figuresOf(withSignup(result({ visitors: 200 }), 10), withSignup(result({ visitors: 200 }), 8))
    expect([su.val, rt.val]).toEqual(['10', '5.0%'])
    expect(su.change?.short).toBe('25% ↑')
    expect(rt.change?.short).toBe('25% ↑')
  })
  it('has eight figures with payments, signups first of the extras', () => {
    const f = figuresOf(withSignup(result({ money: {} }), 10), result(), usd)
    expect(f.map((x) => x.key)).toEqual(['visitors', 'pageviews', 'signups', 'signupRate', 'revenue', 'conversion', 'bounce', 'session'])
  })
  it('shows a signup count of nothing as zero, and no change without a base', () => {
    const [, , su] = figuresOf(withSignup(result(), 0), result())
    expect(su.val).toBe('0')
    expect(su.change).toBeNull()
  })
})
