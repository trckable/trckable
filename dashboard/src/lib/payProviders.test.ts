import { describe, expect, it } from 'vitest'
import { findProviders, PAY_PROVIDERS } from './payProviders'

const ids = (q: string) => findProviders(q).hits.map((p) => p.id)

describe('findProviders', () => {
  it('finds by name, in any case', () => {
    expect(ids('LEMON')).toEqual(['lemonsqueezy'])
    expect(ids('  paddle ')).toEqual(['paddle'])
  })
  it('finds by keyword', () => {
    expect(ids('webhook')).toEqual(['custom'])
    expect(ids('open source')).toEqual(['polar'])
  })
  it('sends wallets and cards to Stripe and Paddle, with the hint', () => {
    const m = findProviders('apple pay')
    expect(m.hits.map((p) => p.id)).toEqual(['stripe', 'paddle'])
    expect(m.wallets).toBe(true)
    expect(findProviders('card').wallets).toBe(true)
    expect(findProviders('polar').wallets).toBe(false)
  })
  it('finds Paddle for "pay" but nothing unshipped', () => {
    expect(ids('pay')).toContain('paddle')
    expect(ids('paypal')).toEqual([])
    expect(findProviders('x', [{ id: 'x', name: 'Xpay', keywords: [], soon: true }]).hits).toEqual([])
  })
  it('finds nothing for an empty or unknown search, so the custom line is what is left', () => {
    expect(ids('')).toEqual([])
    expect(ids('zzz')).toEqual([])
    expect(PAY_PROVIDERS.some((p) => p.id === 'custom')).toBe(true)
  })
})
