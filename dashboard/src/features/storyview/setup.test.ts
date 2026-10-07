// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { DAY_MS, nextStep, putOff, setupSteps, setupVisible } from './setup'

const site = (last?: number, found?: 'site' | 'none') => ({ last_event_at: last, check: found ? { at: 1, found } : undefined })
const done = (s: ReturnType<typeof setupSteps>) => s.map((x) => x.done)

describe('setupSteps', () => {
  it('ticks the snippet when the server found it, before any visit', () => {
    expect(done(setupSteps({ site: site(undefined, 'site'), goals: false, revenue: false }))).toEqual([true, false, false, false])
  })
  it('ticks snippet and verify on the first real visit', () => {
    expect(done(setupSteps({ site: site(100), goals: false, revenue: false }))).toEqual([true, true, false, false])
  })
  it('ticks the goal and the revenue from their own data', () => {
    expect(done(setupSteps({ site: site(100), goals: true, revenue: true }))).toEqual([true, true, true, true])
    expect(done(setupSteps({ site: site(100), goals: false, revenue: true }))).toEqual([true, true, false, true])
  })
  it('names the first open step, none when all are done', () => {
    expect(nextStep(setupSteps({ site: site(100), goals: false, revenue: true }))).toBe('goal')
    expect(nextStep(setupSteps({ site: site(), goals: false, revenue: false }))).toBe('snippet')
    expect(nextStep(setupSteps({ site: site(100), goals: true, revenue: true }))).toBeUndefined()
  })
})

describe('Later', () => {
  beforeEach(() => localStorage.clear())
  it('shows until put off, hides for 7 days, then returns once', () => {
    const t = 1_000_000
    expect(setupVisible('a', t)).toBe(true)
    putOff('a', t)
    expect(setupVisible('a', t + 6 * DAY_MS)).toBe(false)
    expect(setupVisible('a', t + 7 * DAY_MS)).toBe(true)
    putOff('a', t + 7 * DAY_MS)
    expect(setupVisible('a', t + 30 * DAY_MS)).toBe(false)
  })
  it('is kept per site', () => {
    putOff('a', 1)
    expect(setupVisible('b', 2)).toBe(true)
  })
})
