import { describe, expect, it } from 'vitest'
import { barWidths, deltaOf, shareOf, type Row } from './model'

const row = (v: number, c: number | null, p?: number): Row => ({ value: 'x', name: 'x', v, band: c === null ? null : { c, lo: c * 0.8, hi: c * 1.2 }, p })

describe('explore rows', () => {
  it('says usual for a row inside its band, and nothing is made of a row without one', () => {
    expect(deltaOf(row(100, 100), false)).toEqual({ text: 'usual', tone: '' })
    expect(deltaOf(row(100, null), false)).toEqual({ text: 'usual', tone: '' })
  })
  it('lifts a row far above its usual with how many times, and marks one far below', () => {
    expect(deltaOf(row(300, 100), false)).toEqual({ text: '▲ 3×', tone: 'up' })
    expect(deltaOf(row(125, 100), false)).toEqual({ text: '▲ above', tone: 'up' })
    expect(deltaOf(row(40, 100), false)).toEqual({ text: '▼ below', tone: 'dn' })
  })
  it('against the period before it is a percent, and a few points either way is no change in colour', () => {
    expect(deltaOf(row(120, null, 100), true)).toEqual({ text: '+20%', tone: 'up' })
    expect(deltaOf(row(80, null, 100), true)).toEqual({ text: '−20%', tone: 'dn' })
    expect(deltaOf(row(102, null, 100), true)).toEqual({ text: '+2%', tone: '' })
  })
  it('shares and bars', () => {
    expect(shareOf(25, 100)).toBe(25)
    expect(barWidths([row(50, null), row(100, null)])).toEqual([50, 100])
  })
})
