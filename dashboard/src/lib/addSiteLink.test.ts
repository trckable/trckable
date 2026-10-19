import { describe, expect, it } from 'vitest'
import { prefillFrom } from './addSiteLink'

const from = (qs: string) => prefillFrom(new URLSearchParams(qs))

describe('prefillFrom', () => {
  it('cleans the domain the way the add-site field does', () => {
    expect(from('domain=https://www.Shop.example-store.com/cart?x=1')).toEqual({ domain: 'shop.example-store.com', taken: false })
  })
  it('reads taken=1 and nothing else as taken', () => {
    expect(from('domain=mysite.io&taken=1')?.taken).toBe(true)
    expect(from('domain=mysite.io&taken=true')?.taken).toBe(false)
  })
  it('drops a missing, malformed or placeholder domain', () => {
    expect(from('')).toBeNull()
    expect(from('domain=not a domain')).toBeNull()
    expect(from('domain=nodots')).toBeNull()
    expect(from('domain=example.com')).toBeNull()
  })
})
