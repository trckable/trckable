import { afterEach, describe, expect, it, vi } from 'vitest'
import { reveal } from './reveal'
import { at, legsOf, runLegs, runMs } from './run'

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

describe('runLegs on the shared clock', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    reveal.set(-1)
  })
  /** A frame loop the test steps by hand, with the run begun at t = 1000. */
  function stage() {
    let next: ((now: number) => void) | undefined
    vi.stubGlobal('requestAnimationFrame', (f: (now: number) => void) => {
      next = f
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', () => {
      next = undefined
    })
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    return (now: number) => next?.(now)
  }
  it('is on the left edge, not NaN, when the first frame is stamped before the run began', () => {
    const frame = stage()
    runLegs(legsOf([0.4]), () => undefined)
    expect(reveal.get()).toBe(0)
    frame(990)
    expect(reveal.get()).toBe(0)
    frame(1100)
    expect(Number.isFinite(reveal.get())).toBe(true)
    expect(reveal.get()).toBeGreaterThan(0)
  })
  it('hands back to the still chart at the end, and stopping leaves it too', () => {
    const frame = stage()
    const legs = legsOf([0.4])
    const done = vi.fn()
    runLegs(legs, done)
    frame(1000 + runMs(legs) + 1)
    expect(done).toHaveBeenCalledOnce()
    expect(reveal.get()).toBe(-1)
    const stop = runLegs(legs, done)
    frame(1500)
    stop()
    expect(reveal.get()).toBe(-1)
    expect(done).toHaveBeenCalledOnce()
  })
})
