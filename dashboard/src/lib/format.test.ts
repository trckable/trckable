import { describe, expect, it } from 'vitest'
import { delta, fmtMoney, fmtMoneyAxis } from './format'

describe('delta', () => {
  it('has an arrow and a sign, so it reads without colour', () => {
    expect(delta(128, 100)).toEqual({ text: '↑ +28%', short: '28% ↑', tone: 'up', label: 'up 28.0 percent' })
    expect(delta(96, 100)).toEqual({ text: '↓ −4.0%', short: '4.0% ↓', tone: 'down', label: 'down 4.0 percent' })
  })
  it('turns the colour round where lower is better', () => {
    expect(delta(44, 48, true)?.tone).toBe('up')
  })
  it('says nothing when there was nothing before: never "new", never an infinite percentage', () => {
    expect(delta(1329, 0)).toBeNull()
    expect(delta(0, 0)).toBeNull()
    expect(delta(5, undefined)).toBeNull()
  })
  it('is flat, not coloured, for a change under half a percent', () => {
    expect(delta(1002, 1000)?.tone).toBe('flat')
  })
})

describe('fmtMoneyAxis', () => {
  it('writes the currency in the currency\'s own units, short', () => {
    expect(fmtMoneyAxis(0, 'USD', 2)).toBe('$0')
    expect(fmtMoneyAxis(5000, 'USD', 2)).toBe('$50')
    expect(fmtMoneyAxis(150_000, 'USD', 2)).toBe('$1.5K')
    expect(fmtMoneyAxis(2000, 'JPY', 0)).toBe('¥2K')
  })
  it('keeps a cent step readable and survives a currency it does not know', () => {
    expect(fmtMoneyAxis(250, 'USD', 2)).toBe('$2.5')
    expect(fmtMoneyAxis(5000, 'XX', 2)).toBe('50')
  })
})

describe('fmtMoney', () => {
  it('keeps the cents of a small amount whatever was written before it in another exponent', () => {
    expect(fmtMoney(127, 'EUR', 0, { cents: true })).toBe('€127')
    expect(fmtMoney(127, 'EUR', 2, { cents: true })).toBe('€1.27')
    expect(fmtMoney(574_500, 'EUR', 2)).toBe('€5,745')
    expect(fmtMoney(6800, 'EUR', 2)).toBe('€68.00')
  })
})
