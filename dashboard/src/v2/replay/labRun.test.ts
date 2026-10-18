import { describe, expect, it } from 'vitest'
import { at, legsOf, runMs } from './labRun'

describe('the story run', () => {
  const legs = legsOf([0.3, 0.7])
  it('rests on each moment and ends on the whole line', () => {
    expect(legs).toHaveLength(3)
    const t = legs[0].go + 400
    expect(at(legs, t).p).toBeCloseTo(0.3, 6)
    expect(at(legs, runMs(legs)).over).toBe(true)
  })
  it('starts on the left edge even when the first frame is stamped just before the run', () => {
    expect(at(legsOf([0, 0.5]), -5).p).toBe(0)
    expect(at(legsOf([0.5]), -5).p).toBe(0)
  })
  it('never goes backwards', () => {
    let last = -1
    for (let t = 0; t < runMs(legs); t += 20) {
      const p = at(legs, t).p
      expect(p).toBeGreaterThanOrEqual(last)
      last = p
    }
  })
  it('takes about seven seconds with five moments', () => {
    const ms = runMs(legsOf([0, 0.25, 0.5, 0.7, 0.9]))
    expect(ms).toBeGreaterThan(6500)
    expect(ms).toBeLessThan(9000)
  })
})
