import { describe, expect, it } from 'vitest'
import { headline, rateOf, type QualityRow } from './quality'

const row = (o: Partial<QualityRow>): QualityRow => ({ value: 'x', name: 'X', people: 20, page: '/', rate: null, lcp: null, ...o })

describe('channel quality', () => {
  it('says nothing about a rate from too few people', () => expect(rateOf(3, 6)).toBeNull())
  it('names a slow landing first', () => expect(headline([row({ name: 'Search', lcp: 3100, page: '/a', rate: 0.5 }), row({ rate: 0.1 })], 'signup')).toContain('Search sends 20 people to a slow page (/a, 3.1s)'))
  it('names the best converter', () => expect(headline([row({ name: 'Email', rate: 0.2 }), row({ rate: 0.1 })], 'signup')).toBe('Best converter: Email, 20% reach signup.'))
  it('claims nothing when too little is known', () => expect(headline([row({ people: 4 })], 'signup')).toContain('Too few'))
})
