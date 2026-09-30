import { describe, expect, it } from 'vitest'
import { modeTag } from './payments'

describe('modeTag', () => {
  it('calls the test environment of Paddle and Polar a sandbox', () => {
    expect(modeTag('paddle')).toBe('Sandbox')
    expect(modeTag('polar')).toBe('Sandbox')
  })
  it('keeps "test mode" for the others', () => {
    expect(modeTag('dodo')).toBe('test mode')
    expect(modeTag('stripe')).toBe('test mode')
  })
})
