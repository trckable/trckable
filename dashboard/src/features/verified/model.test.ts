import { describe, expect, it } from 'vitest'
import type { Verified, VerifiedSource } from '../../lib/api'
import { lastChecked, missingProviders, proofFor, providerName, working } from './model'

const src = (s: Partial<VerifiedSource>): VerifiedSource => ({ kind: 'snippet', ok: true, since: 1000, checked: 2000, detail: '', ...s })
const v = (...s: Partial<VerifiedSource>[]): Verified => ({ sources: s.map(src) })

describe('what counts', () => {
  it('counts only the sources that work, and none when nothing is listed', () => {
    expect(working(undefined)).toEqual([])
    expect(working(v({ ok: false }, { kind: 'gsc' })).map((s) => s.kind)).toEqual(['gsc'])
  })

  it('finds the source behind each card, and none once it stops working', () => {
    const all = v({ kind: 'snippet' }, { kind: 'gsc' }, { kind: 'payments', provider: 'paddle' })
    expect(proofFor(all, 'visitors')?.kind).toBe('snippet')
    expect(proofFor(all, 'search')?.kind).toBe('gsc')
    expect(proofFor(all, 'revenue')?.provider).toBe('paddle')
    const failing = v({ kind: 'snippet', ok: false }, { kind: 'gsc', ok: false }, { kind: 'payments', provider: 'stripe', ok: false })
    expect(proofFor(failing, 'visitors')).toBeNull()
    expect(proofFor(failing, 'search')).toBeNull()
    expect(proofFor(failing, 'revenue')).toBeNull()
    expect(proofFor(undefined, 'visitors')).toBeNull()
  })

  it('takes the first working provider for the money', () => {
    const two = v({ kind: 'payments', provider: 'stripe', ok: false }, { kind: 'payments', provider: 'paypal' })
    expect(proofFor(two, 'revenue')?.provider).toBe('paypal')
  })
})

describe('the Connect row and the footer', () => {
  it('offers the providers that are not connected, and none that are', () => {
    expect(missingProviders(undefined)).toEqual(['Stripe', 'PayPal', 'Paddle', 'Lemon Squeezy'])
    expect(missingProviders(v({ kind: 'payments', provider: 'stripe' }, { kind: 'payments', provider: 'paddle', ok: false }))).toEqual(['PayPal', 'Lemon Squeezy'])
  })

  it('names providers, and falls back to the id', () => {
    expect(providerName('lemonsqueezy')).toBe('Lemon Squeezy')
    expect(providerName('newpay')).toBe('newpay')
    expect(providerName(undefined)).toBe('')
  })

  it('reports the latest look at any source', () => {
    expect(lastChecked(v({ checked: 5 }, { kind: 'gsc', checked: 9 }))).toBe(9)
    expect(lastChecked(undefined)).toBe(0)
  })
})
