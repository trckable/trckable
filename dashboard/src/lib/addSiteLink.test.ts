import { describe, expect, it } from 'vitest'
import { firstStep, prefillFrom } from './addSiteLink'

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

describe('firstStep', () => {
  const waiting = [{ id: 'a', domain: 'old.io' }, { id: 'b', domain: 'mysite.io' }]
  it('asks for the domain when there is nothing to resume', () => {
    expect(firstStep(undefined, null)).toEqual({ step: 'site', active: '' })
  })
  it('resumes the install without a link', () => {
    expect(firstStep(waiting, null)).toEqual({ step: 'install', active: 'a' })
  })
  it('keeps a claimed domain that is not one of the waiting sites', () => {
    expect(firstStep(waiting, { domain: 'new.io', taken: false })).toEqual({ step: 'site', active: '' })
  })
  it('opens the install of the claimed domain when it is already added', () => {
    expect(firstStep(waiting, { domain: 'mysite.io', taken: false })).toEqual({ step: 'install', active: 'b' })
  })
})
