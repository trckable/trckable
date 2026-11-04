import { describe, expect, it } from 'vitest'
import { customerName, initialsOf, licenseView, methodLabel, spanOf } from './customerModel'

const key = { last4: 'D3F9', status: 'active', used: 2, limit: 3, created_at: '2026-10-01T10:00:00Z', activations: ['2026-10-05T10:00:00Z', '2026-10-02T10:00:00Z'] }

describe('licenseView', () => {
  it('orders devices by activation and measures the first against the purchase', () => {
    const v = licenseView(key)
    expect(v.devices.map((d) => d.n)).toEqual([1, 2])
    expect(v.devices[0].at).toBeLessThan(v.devices[1].at)
    expect(v.firstAfter).toBe(24 * 3600 * 1000)
    expect(v.changes).toBe(1)
    expect(v.activated).toBe(true)
    expect(v.limit).toBe(3)
  })
  it('a key never used says so, and one with no limit has none', () => {
    const v = licenseView({ ...key, used: 0, limit: undefined, activations: [] })
    expect(v.activated).toBe(false)
    expect(v.firstAfter).toBeUndefined()
    expect(v.changes).toBe(0)
    expect(v.limit).toBeUndefined()
  })
  it('an unknown status is kept as the provider said it and marked unknown, never read as active', () => {
    expect(licenseView({ ...key, status: 'odd' })).toMatchObject({ status: 'odd', known: false })
    expect(licenseView({ ...key, status: 'disabled' })).toMatchObject({ status: 'disabled', known: true })
  })
})

describe('spanOf', () => {
  it('picks the unit that reads best', () => {
    expect(spanOf(20_000)).toEqual({ unit: 'now', n: 0 })
    expect(spanOf(5 * 60_000)).toEqual({ unit: 'min', n: 5 })
    expect(spanOf(3 * 3600_000)).toEqual({ unit: 'hour', n: 3 })
    expect(spanOf(2 * 86400_000)).toEqual({ unit: 'day', n: 2 })
  })
})

describe('customerName', () => {
  it('falls back when the provider gave none', () => {
    expect(customerName(' Ada ', 'Customer')).toBe('Ada')
    expect(customerName('', 'Customer')).toBe('Customer')
    expect(customerName(undefined, 'Customer')).toBe('Customer')
  })
})

describe('initialsOf', () => {
  it('takes the first and last name, or the start of one word, never nothing', () => {
    expect(initialsOf('Ada Lovelace')).toBe('AL')
    expect(initialsOf('ada@example.com')).toBe('AD')
    expect(initialsOf('')).toBe('·')
  })
})

describe('methodLabel', () => {
  const labels = { card: 'Card', other: 'Other' }
  it('names a known code, files an unknown one under other, and says nothing when empty', () => {
    expect(methodLabel('card', labels)).toBe('Card')
    expect(methodLabel('upi', labels)).toBe('Other')
    expect(methodLabel('', labels)).toBe('')
    expect(methodLabel(undefined, labels)).toBe('')
  })
})
