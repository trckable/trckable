import { describe, expect, it } from 'vitest'
import { guessOf } from './kind'

describe('the kind the homepage read suggests', () => {
  it('is a shop, a SaaS or a blog when the read found one', () => {
    expect(guessOf({ kind: 'shop' })).toBe('shop')
    expect(guessOf({ kind: 'saas' })).toBe('saas')
    expect(guessOf({ kind: 'content' })).toBe('content')
  })
  it('is nothing when the read found nothing, failed or said other', () => {
    expect(guessOf({ kind: 'other' })).toBeNull()
    expect(guessOf({})).toBeNull()
    expect(guessOf(null)).toBeNull()
  })
})
