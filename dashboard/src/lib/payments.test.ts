import { describe, expect, it } from 'vitest'
import { keyPicksMode, modeTag } from './payments'

describe('modeTag', () => {
  it('calls the test environment of Paddle, Polar and PayPal a sandbox', () => {
    expect(modeTag('paypal')).toBe('Sandbox')
    expect(modeTag('paddle')).toBe('Sandbox')
    expect(modeTag('polar')).toBe('Sandbox')
  })
  it('keeps "test mode" for the others', () => {
    expect(modeTag('dodo')).toBe('test mode')
    expect(modeTag('stripe')).toBe('test mode')
  })
})

describe('keyPicksMode', () => {
  it('lets a Paddle key decide once one is typed', () => {
    expect(keyPicksMode('paddle', 'pdl_live_apikey_x')).toBe(true)
    expect(keyPicksMode('paddle', '  ')).toBe(false)
  })
  it('leaves the other providers to the switch', () => {
    expect(keyPicksMode('polar', 'polar_at_x')).toBe(false)
  })
})
