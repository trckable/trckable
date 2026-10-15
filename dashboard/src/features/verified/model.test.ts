import { describe, expect, it } from 'vitest'
import type { Verified, VerifiedSource } from '../../lib/api'
import { earned, lastChecked, missing, proofFor, providerName, working } from './model'

const src = (s: Partial<VerifiedSource>): VerifiedSource => ({ kind: 'payments', provider: 'stripe', ok: true, since: 1000, checked: 2000, detail: '', ...s })
const v = (...s: Partial<VerifiedSource>[]): Verified => ({ sources: s.map(src) })

describe('what counts', () => {
  it('counts only the sources that work, and none when nothing is listed', () => {
    expect(working(undefined)).toEqual([])
    expect(working(v({ ok: false }, { kind: 'gsc' })).map((s) => s.kind)).toEqual(['gsc'])
  })

  it('never counts the snippet on the site, an old server’s answer included', () => {
    expect(working(v({ kind: 'snippet' }))).toEqual([])
    expect(earned(v({ kind: 'snippet' }))).toEqual([])
  })

  it('is one badge per kind, whichever providers deliver', () => {
    const many = v({ provider: 'stripe' }, { provider: 'paddle' }, { provider: 'paypal', ok: false })
    expect(working(many)).toHaveLength(1)
    expect(earned(many)).toEqual(['payments'])
    expect(earned(v({ provider: 'polar' }, { kind: 'gsc' }))).toEqual(['payments', 'search'])
  })

  it('finds the source behind each card, and none once it stops working', () => {
    const all = v({ kind: 'gsc' }, { provider: 'paddle' })
    expect(proofFor(all, 'search')?.kind).toBe('gsc')
    expect(proofFor(all, 'revenue')?.provider).toBe('paddle')
    const failing = v({ kind: 'gsc', ok: false }, { provider: 'stripe', ok: false })
    expect(proofFor(failing, 'search')).toBeNull()
    expect(proofFor(failing, 'revenue')).toBeNull()
    expect(proofFor(undefined, 'revenue')).toBeNull()
  })

  it('takes the first working provider for the money', () => {
    const two = v({ provider: 'stripe', ok: false }, { provider: 'paypal' })
    expect(proofFor(two, 'revenue')?.provider).toBe('paypal')
  })
})

describe('the Connect rows and the footer', () => {
  it('offers each kind that is not earned, and none that is', () => {
    expect(missing(undefined)).toEqual(['payments', 'search'])
    expect(missing(v({ provider: 'stripe' }))).toEqual(['search'])
    expect(missing(v({ provider: 'stripe', ok: false }, { kind: 'gsc' }))).toEqual(['payments'])
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
