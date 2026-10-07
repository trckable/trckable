import { describe, expect, it } from 'vitest'
import { areaPaths, clampPct, deltaOf, halfRing, ringPoint, toneOf } from './model'

describe('half rings', () => {
  it('runs from the left end over the top to the right end', () => {
    expect(halfRing(100, 104, 84)).toBe('M16 104 A84 84 0 0 1 184 104')
  })
  it('puts the knob at the ends and the top', () => {
    expect(ringPoint(110, 108, 92, 0)).toEqual({ x: 18, y: 108 })
    expect(ringPoint(110, 108, 92, 100)).toEqual({ x: 202, y: 108 })
    expect(ringPoint(110, 108, 92, 50)).toEqual({ x: 110, y: 16 })
  })
  it('keeps a share between none and all', () => {
    expect([clampPct(-5), clampPct(140), clampPct(NaN), clampPct(37)]).toEqual([0, 100, 0, 37])
  })
})

describe('tones', () => {
  it('calls an up move good, unless lower is better', () => {
    expect(toneOf({ dir: 'up', pct: 5 })).toBe('good')
    expect(toneOf({ dir: 'up', pct: 5 }, true)).toBe('bad')
    expect(toneOf({ dir: 'down', pct: 5 }, true)).toBe('good')
    expect(toneOf({ dir: 'flat', pct: 0 })).toBe('neutral')
    expect(toneOf(null)).toBe('neutral')
  })
  it('writes the move, or nothing when there is nothing to compare', () => {
    expect(deltaOf(112, 100, '▲', '▼')).toEqual({ text: '▲ 12%', tone: 'good' })
    expect(deltaOf(50, 100, '▲', '▼', true)).toEqual({ text: '▼ 50%', tone: 'good' })
    expect(deltaOf(5, undefined, '▲', '▼')).toBeNull()
    expect(deltaOf(100, 100, '▲', '▼')).toBeNull()
  })
})

describe('area paths', () => {
  it('closes the area down to the floor', () => {
    const { line, area } = areaPaths([1, 3, 2, 5], 300, 64)
    expect(line.startsWith('M0')).toBe(true)
    expect(area.endsWith('L300.0 64L0.0 64Z')).toBe(true)
  })
  it('draws a flat series in the middle, and nothing for none', () => {
    expect(areaPaths([4, 4, 4], 300, 64).line).toContain('32.0')
    expect(areaPaths([], 300, 64)).toEqual({ line: '', area: '' })
  })
})
