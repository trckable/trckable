import { describe, expect, it } from 'vitest'
import { whyDown, whyJump, whyUsual } from './why'

describe('why', () => {
  const base = { name: 'Hacker News', host: 'news.ycombinator.com', now: 186, lo: 8, hi: 10 }
  it('names the post that was found on the same place, and says what to do', () => {
    const w = whyJump({ ...base, mention: { host: 'Hacker News', title: 'Show HN: X', at: '14:05', points: 214, comments: 58 }, page: '/' })
    expect(w.cause).toContain('“Show HN: X”')
    expect(w.cause).toContain('214 points')
    expect(w.todo).toMatch(/Reply/)
  })
  it('without a post it says who and not why, and never guesses', () => {
    const w = whyJump(base)
    expect(w.cause).toBe('Hacker News sent 186 people, usually 8–10. We can tell who sent them, not why: only you know what was shared there.')
  })
  it('an outage is said in the check\'s own words, or honestly unknown', () => {
    expect(whyDown({ domain: 'x.com', cause: 'DNS name not found', minutes: 5, ongoing: true }).cause).toBe('x.com stopped answering: DNS name not found.')
    expect(whyDown({ domain: 'x.com', minutes: 5, ongoing: false }).cause).toContain('cannot say why')
  })
  it('a number is told against its own days', () => {
    const w = whyUsual({ label: 'People', now: 926, weeks: [{ day: 'a', visitors: 700 }, { day: 'b', visitors: 750 }], weekday: 'Friday', at: '16:30' })
    expect(w.cause).toBe('People so far today: 926. The same stretch (up to 16:30) on the last Fridays: 700, 750.')
  })
  it('a first day has nothing to be told against, and does not claim zeros', () => {
    const w = whyUsual({ label: 'People', now: 33, weeks: [{ day: 'a', visitors: 0 }, { day: 'b', visitors: 0 }], weekday: 'Friday', at: '15:00' })
    expect(w.cause).toBe('People has no earlier days to be told against yet.')
  })
})
