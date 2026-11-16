// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Verified, VerifiedSource } from '../../lib/api'
import { VerifiedBadge, badgeSource } from './VerifiedBadge'
import logos from './logos.json'
import { SourceMark } from './Marks'
import { slotOfSection } from './model'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const src = (s: Partial<VerifiedSource>): VerifiedSource => ({ kind: 'payments', provider: 'stripe', ok: true, since: 1, checked: 2, detail: '', ...s })
const v = (...s: Partial<VerifiedSource>[]): Verified => ({ sources: s.map(src) })

let root: Root
let host: HTMLDivElement
const draw = (el: React.ReactElement) => act(() => root.render(el))

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('the badge by a section title', () => {
  it('is on Search and Sales only', () => {
    expect(slotOfSection('search')).toBe('search')
    expect(slotOfSection('sales')).toBe('revenue')
    expect(slotOfSection('pages')).toBeUndefined()
  })

  it('names the source that works, for each provider with a logo', () => {
    for (const p of Object.keys(logos)) expect(badgeSource(v({ provider: p }), 'revenue')).toBe(p)
    expect(badgeSource(v({ kind: 'gsc', provider: undefined }), 'search')).toBe('gsc')
  })

  it('shows nothing without a working source of its kind, or for a provider with no logo', () => {
    expect(badgeSource(undefined, 'revenue')).toBeNull()
    expect(badgeSource(v({ ok: false }), 'revenue')).toBeNull()
    expect(badgeSource(v({ provider: 'stripe' }), 'search')).toBeNull()
    expect(badgeSource(v({ kind: 'gsc', provider: undefined }), 'revenue')).toBeNull()
    expect(badgeSource(v({ provider: 'paypal' }), 'revenue')).toBeNull()
    expect(badgeSource(v({ provider: 'gumroad' }), 'revenue')).toBeNull()
  })

  it('shows nothing on money that is not all verified', () => {
    expect(badgeSource(v({ provider: 'stripe', mixed: true }), 'revenue')).toBeNull()
    expect(badgeSource(v({ provider: 'stripe', mixed: false }), 'revenue')).toBe('stripe')
  })

  it('draws the source mark of Stripe from the shared logos', () => {
    draw(<SourceMark s={{ kind: 'payments', provider: 'stripe' }} />)
    expect(host.querySelector('svg path')?.getAttribute('d')).toBe(logos.stripe.d)
    draw(<SourceMark s={{ kind: 'payments', provider: 'paypal' }} />)
    expect(host.querySelector('svg.vf-pmark')).toBeNull()
  })

  it('draws the logo, the word and the check', () => {
    draw(<VerifiedBadge verified={v({ provider: 'paddle' })} slot="revenue" />)
    const b = host.querySelector('[data-verified-source]')
    expect(b?.getAttribute('data-verified-source')).toBe('paddle')
    expect(b?.textContent).toBe('Verified')
    expect(b?.querySelector('svg.vf-pmark path')?.getAttribute('d')).toBe(logos.paddle.d)
    expect(b?.querySelector('.vf-badge-tick svg')).not.toBeNull()
  })

  it('draws nothing for a section with no slot', () => {
    draw(<VerifiedBadge verified={v({})} slot={slotOfSection('pages')} />)
    expect(host.innerHTML).toBe('')
  })
})
