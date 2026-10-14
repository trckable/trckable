import { describe, expect, it } from 'vitest'
import { delta, fmtMoney, fmtMoneyAxis, fmtSpan, fmtUptime, move, relativeAgo } from './format'

describe('delta, where it says nothing or too much', () => {
  it('caps a change over ten times as "10x+"', () => {
    expect(delta(1500, 100)).toMatchObject({ short: '10x+ ↑', text: '↑ 10x+', label: 'up more than 10 times' })
    expect(delta(900, 100)?.short).toBe('800% ↑')
  })
  it('names the better or worse move where lower is better', () => {
    expect(delta(0.42, 0.4, true)?.verdict).toBe('worse')
    expect(delta(0.38, 0.4, true)?.verdict).toBe('better')
    expect(delta(0.4, 0.4, true)?.verdict).toBeUndefined()
    expect(delta(110, 100)?.verdict).toBeUndefined()
  })
})

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

describe('relativeAgo', () => {
  const now = 1_000_000
  it('says how long ago in a few words, the same on every screen', () => {
    expect(relativeAgo(now - 10, now)).toBe('just now')
    expect(relativeAgo(now - 5 * 60, now)).toBe('5 min ago')
    expect(relativeAgo(now - 3 * 3600, now)).toBe('3 h ago')
    expect(relativeAgo(now - 86400, now)).toBe('yesterday')
    expect(relativeAgo(now - 3 * 86400, now)).toBe('3 days ago')
    expect(relativeAgo(now + 50, now)).toBe('just now')
  })
})

describe('fmtUptime and fmtSpan', () => {
  it('writes the share of time up to one decimal', () => {
    expect(fmtUptime(99.9)).toBe('99.9')
    expect(fmtUptime(100)).toBe('100.0')
  })
  it('writes a stretch of time the way people say it', () => {
    expect(fmtSpan(20)).toBe('<1m')
    expect(fmtSpan(45 * 60)).toBe('45m')
    expect(fmtSpan(3 * 3600 + 12 * 60)).toBe('3h 12m')
    expect(fmtSpan(2 * 86400 + 4 * 3600)).toBe('2d 4h')
  })
})

describe('move', () => {
  it('is one rule for every screen: flat under half a percent, one decimal under 10', () => {
    expect(move(112, 100)).toMatchObject({ dir: 'up', pct: '12' })
    expect(move(101, 100)).toMatchObject({ dir: 'up', pct: '1.0' })
    expect(move(100.4, 100)?.dir).toBe('flat')
    expect(move(1500, 100)?.capped).toBe(true)
    expect(move(5, 0)).toBeNull()
  })
})
