import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sentence, throttle } from './announce'

describe('telling a screen reader about new visits', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('says the first at once, then at most one sentence per interval', () => {
    const said: string[] = []
    const t = throttle(10_000, (s) => said.push(s))
    t.add([{ kind: 'pageview', ts: 1, path: '/pricing', channel: 'Search' }])
    vi.advanceTimersByTime(0)
    expect(said).toEqual(['New visit: /pricing, from Search'])
    t.add([{ kind: 'pageview', ts: 2, path: '/a' }])
    t.add([{ kind: 'pageview', ts: 3, path: '/b' }])
    vi.advanceTimersByTime(9_000)
    expect(said).toHaveLength(1)
    vi.advanceTimersByTime(1_000)
    expect(said).toEqual(['New visit: /pricing, from Search', '2 new visits'])
    vi.advanceTimersByTime(60_000)
    expect(said).toHaveLength(2) // nothing new, nothing said
    t.stop()
  })

  it('names a goal and a direct visit plainly', () => {
    expect(sentence([{ kind: 'goal', ts: 1, goal: 'signup', channel: 'AI' }])).toBe('New visit: Goal: signup, from AI assistants')
    expect(sentence([{ kind: 'pageview', ts: 1 }])).toBe('New visit: /, from Direct')
  })
})
