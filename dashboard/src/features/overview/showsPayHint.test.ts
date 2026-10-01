import { describe, expect, it } from 'vitest'
import { showsPayHint } from './showsPayHint'

const money = true

describe('showsPayHint', () => {
  it('shows for an owner once the report is in and no provider is connected', () => {
    expect(showsPayHint({ loading: false, canChange: true })).toBe(true)
  })
  it('is gone once payments are connected', () => {
    expect(showsPayHint({ money, loading: false, canChange: true })).toBe(false)
  })
  it('waits for the report, so it does not flash before the money arrives', () => {
    expect(showsPayHint({ loading: true, canChange: true })).toBe(false)
  })
  it('is not offered to a viewer or on a shared link', () => {
    expect(showsPayHint({ loading: false, canChange: false })).toBe(false)
  })
})
