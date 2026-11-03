import { describe, expect, it } from 'vitest'
import { headline, mainOf, ranked, rateOf, type QualityRow } from './quality'

const row = (o: Partial<QualityRow>): QualityRow => ({ value: 'x', name: 'X', channel: '', people: 20, page: '/', engaged: null, goal: null, sales: null, lcp: null, ...o })

describe('channel quality', () => {
  it('says nothing about a rate from too few people', () => expect(rateOf(3, 6)).toBeNull())
  it('ranks by the goal, else sales, else engaged visits', () => {
    expect(mainOf(true, true)).toBe('goal')
    expect(mainOf(false, true)).toBe('sales')
    expect(mainOf(false, false)).toBe('engaged')
  })
  it('puts the best rate first and the sources too small to judge last', () => {
    const rows = [row({ value: 'a', people: 500 }), row({ value: 'b', goal: 0.1 }), row({ value: 'c', goal: 0.3 })]
    expect(ranked(rows, 'goal').map((r) => r.value)).toEqual(['c', 'b', 'a'])
  })
  it('names the best converter with its landing page and a slow load', () => expect(headline([row({ name: 'Reddit', goal: 0.2, page: '/pricing', lcp: 4800 }), row({ goal: 0.1 })], 'goal')).toBe('Reddit converts best, but lands on /pricing at 4.8 s.'))
  it('names a fast landing without a warning', () => expect(headline([row({ name: 'Email', sales: 0.2, page: '/pricing', lcp: 1200 }), row({ sales: 0.1 })], 'sales')).toContain('loads in 1.2 s'))
  it('leaves the page out when there is none', () => expect(headline([row({ name: 'Email', goal: 0.2, page: null }), row({ goal: 0.1 })], 'goal')).toBe('Email converts best.'))
  it('falls back to engaged visits with no goals and no payments', () => expect(headline([row({ name: 'Search', engaged: 0.72 }), row({ engaged: 0.4 })], 'engaged')).toBe('Search holds people best: 72% are engaged.'))
  it('claims nothing when too little is known', () => expect(headline([row({ people: 4 })], 'goal')).toContain('Too few'))
})
