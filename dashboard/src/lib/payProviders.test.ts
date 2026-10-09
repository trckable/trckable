import { describe, expect, it } from 'vitest'
import { findProviders, PAY_PROVIDERS, searchableCount } from './payProviders'

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
  it('matches the start of a word, not any letters inside it', () => {
    const s = ids('s')
    expect(s).toEqual(expect.arrayContaining(['stripe', 'lemonsqueezy', 'shopify', 'square', 'samcart']))
    expect(s).not.toContain('paddle')
    expect(s).not.toContain('polar')
    expect(ids('st')).toEqual(expect.arrayContaining(['stripe']))
    expect(ids('st')).not.toContain('shopify')
  })
  it('finds the providers whose name starts with "pay", and not Paddle', () => {
    expect(ids('pay').sort()).toEqual(['dodo', 'payhip', 'paypal', 'paystack'])
    expect(ids('pay')).not.toContain('paddle')
  })
  it('does not find a name from letters in its middle', () => {
    expect(ids('pal')).toEqual([])
    expect(ids('shop')).toEqual(['shopify'])
  })
  it('ranks name matches before keyword matches', () => {
    const all = ids('m')
    expect(all.indexOf('mollie')).toBeLessThan(all.indexOf('paddle'))
  })
  it('marks the catalog as via webhook, and never offers an unshipped provider', () => {
    expect(findProviders('shopify').hits[0].viaWebhook).toBe(true)
    expect(findProviders('stripe').hits[0].viaWebhook).toBeUndefined()
    expect(findProviders('x', [{ id: 'x', name: 'Xpay', keywords: [], soon: true }]).hits).toEqual([])
  })
  it('counts what a search can find', () => {
    expect(searchableCount()).toBe('30+')
  })
  it('finds nothing for an empty or unknown search, so the custom line is what is left', () => {
    expect(ids('')).toEqual([])
    expect(ids('zzz')).toEqual([])
    expect(PAY_PROVIDERS.some((p) => p.id === 'custom')).toBe(true)
  })
})
