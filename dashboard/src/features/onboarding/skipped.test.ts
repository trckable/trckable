// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { clearSkipped, markSkipped, wasSkipped } from './skipped'

describe('skipped, per account', () => {
  beforeEach(() => {
    localStorage.clear()
    clearSkipped('a@x.com')
    clearSkipped('b@x.com')
  })
  it('is off until the account skips', () => expect(wasSkipped('a@x.com')).toBe(false))
  it('holds for the account that skipped, not for another in the same browser', () => {
    markSkipped('a@x.com')
    expect(wasSkipped('a@x.com')).toBe(true)
    expect(wasSkipped('A@X.com')).toBe(true)
    expect(wasSkipped('b@x.com')).toBe(false)
  })
  it('is cleared when the first run is wanted again', () => {
    markSkipped('a@x.com')
    clearSkipped('a@x.com')
    expect(wasSkipped('a@x.com')).toBe(false)
  })
})
