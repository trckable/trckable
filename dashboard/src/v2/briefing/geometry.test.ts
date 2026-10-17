import { describe, expect, it } from 'vitest'
import { dash, niceStep, ringTone, smooth, spark } from './geometry'

describe('geometry', () => {
  it('draws a smooth path through every point', () => {
    expect(smooth([])).toBe('')
    expect(smooth([[0, 0]])).toBe('M0.0,0.0')
    const d = smooth([[0, 10], [10, 0], [20, 10]])
    expect(d.startsWith('M0.0,10.0 C')).toBe(true)
    expect(d.match(/C/g)).toHaveLength(2)
    expect(d.endsWith('20.0,10.0')).toBe(true)
  })
  it('steps gridlines by 1, 2 or 5 times a power of ten', () => {
    expect(niceStep(180)).toBe(50)
    expect(niceStep(40)).toBe(10)
    expect(niceStep(0)).toBe(1)
  })
  it('has no sparkline under two points, and closes the glow along the bottom', () => {
    expect(spark([3], 64)).toBeNull()
    const s = spark([1, 5, 2], 64)
    expect(s?.area).toBe(`${s?.line} L300,64 L0,64 Z`)
  })
  it('dashes the ring by its score and tones it', () => {
    expect(dash(100).split(' ')[0]).toBe(dash(100).split(' ')[1].slice(0, 5))
    expect([ringTone(90), ringTone(60), ringTone(20)]).toEqual(['lime', 'amber', 'red'])
  })
})
