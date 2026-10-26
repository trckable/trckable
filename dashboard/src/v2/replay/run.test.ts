import { afterEach, describe, expect, it, vi } from 'vitest'
import { reveal } from './reveal'
import { arrivals, at, legsOf, nextStop, runLegs, runMs } from './run'

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
    const run = runLegs(legs, done)
    frame(1500)
    run.stop()
    expect(reveal.get()).toBe(-1)
    expect(done).toHaveBeenCalledOnce()
  })
  it('waits while paused, goes on from the same place, and jumps to the next moment', () => {
    const frame = stage()
    const legs = legsOf([0.4, 0.8])
    const done = vi.fn()
    const run = runLegs(legs, done)
    frame(1500)
    const was = reveal.get()
    vi.spyOn(performance, 'now').mockReturnValue(1500)
    run.pause()
    vi.spyOn(performance, 'now').mockReturnValue(9000)
    run.resume()
    frame(9001)
    expect(Math.abs(reveal.get() - was)).toBeLessThan(0.02)
    expect(run.next()).toBe(true)
    frame(9002)
    expect(reveal.get()).toBeCloseTo(0.4, 1)
    expect(done).not.toHaveBeenCalled()
  })
  it('ends the run when there is no moment left to go to', () => {
    stage()
    const legs = legsOf([0.4])
    const done = vi.fn()
    const run = runLegs(legs, done)
    vi.spyOn(performance, 'now').mockReturnValue(1000 + arrivals(legs)[0] + 10)
    expect(run.next()).toBe(false)
    expect(done).toHaveBeenCalledOnce()
    expect(reveal.get()).toBe(-1)
  })
})

describe('arrivals and nextStop', () => {
  it('name when the line reaches each moment, and the next one after a time', () => {
    const legs = legsOf([0.25, 0.75])
    const a = arrivals(legs)
    expect(a).toHaveLength(3)
    expect(a[0]).toBeLessThan(a[1])
    expect(nextStop(legs, 0)).toBe(a[0])
    expect(nextStop(legs, a[0])).toBe(a[1])
    expect(nextStop(legs, a[1])).toBeNull()
  })
})
