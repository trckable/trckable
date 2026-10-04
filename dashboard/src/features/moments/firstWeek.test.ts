// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { eligible, FIRST_WEEK_S, inFirstWeek, keptOf, pick, remember, trafficDay, type Known } from './firstWeek'
import { markUsed, wasUsed } from './store'

afterEach(() => localStorage.clear())

const none: Known = { replayed: false, fullOpened: false, weekly: false, search: false, exclude: false, ai: false, fresh: true }
const fresh = { done: [] }

describe('a site\'s first week', () => {
  it('is its first seven days, and needs to know when it began', () => {
    const now = 1_790_000_000
    expect(inFirstWeek(now - 2 * 86400, now)).toBe(true)
    expect(inFirstWeek(now - FIRST_WEEK_S, now)).toBe(false)
    expect(inFirstWeek(undefined, now)).toBe(false)
  })
})

describe('which card', () => {
  it('Replay, Full, the weekly email, Search Console, in that order', () => {
    expect(eligible(none, fresh)).toEqual(['replay', 'full', 'weekly', 'search'])
  })

  it('never one for something already used or set up', () => {
    expect(eligible({ ...none, replayed: true, fullOpened: true, weekly: true }, fresh)).toEqual(['search'])
    expect(eligible({ ...none, replayed: true, fullOpened: true, weekly: true, search: true }, fresh)).toEqual([])
  })

  it('never one that was put away or acted on', () => {
    expect(eligible(none, { done: ['replay', 'weekly'] })).toEqual(['full', 'search'])
  })

  it('one a day: the same card all day, then nothing once it is put away, and the next one tomorrow', () => {
    expect(pick(none, fresh, '2026-10-02')).toBe('replay')
    const picked = { done: [], day: '2026-10-02', id: 'replay' as const }
    expect(pick(none, picked, '2026-10-02')).toBe('replay')
    const away = { done: ['replay' as const], day: '2026-10-02', id: 'replay' as const }
    expect(pick(none, away, '2026-10-02')).toBeNull()
    expect(pick(none, away, '2026-10-03')).toBe('full')
  })

  it('a card that became unnecessary today is not swapped for another today', () => {
    const picked = { done: [], day: '2026-10-02', id: 'weekly' as const }
    expect(pick({ ...none, weekly: true }, picked, '2026-10-02')).toBeNull()
  })
})

describe('the card about your own visits', () => {
  const asked = { ...none, exclude: true }

  it('comes first, and only when it is asked for', () => {
    expect(eligible(asked, fresh)).toEqual(['exclude', 'replay', 'full', 'weekly', 'search'])
    expect(eligible(none, fresh)).not.toContain('exclude')
  })

  it('is the one card of the day, and the next one waits until tomorrow', () => {
    expect(pick(asked, fresh, '2026-10-02')).toBe('exclude')
    const away = { done: ['exclude' as const], day: '2026-10-02', id: 'exclude' as const }
    expect(pick(asked, away, '2026-10-02')).toBeNull()
    expect(pick(none, away, '2026-10-03')).toBe('replay')
  })

  it('is asked on the first day with traffic, and never on a later one', () => {
    expect(trafficDay('tkb_a', '2026-10-02')).toBe('2026-10-02')
    expect(trafficDay('tkb_a', '2026-10-03')).toBe('2026-10-02') // the day is kept, so tomorrow is not it
    expect(trafficDay('tkb_b', '2026-10-03')).toBe('2026-10-03') // another site has its own
  })

  it('keeps the day when a card is put away, and does not ask again once put away', () => {
    trafficDay('tkb_a', '2026-10-02')
    remember('tkb_a', { ...keptOf('tkb_a'), done: ['exclude'], day: '2026-10-02', id: 'exclude' })
    expect(keptOf('tkb_a').traffic).toBe('2026-10-02')
    expect(eligible(asked, keptOf('tkb_a'))).not.toContain('exclude')
  })
})

describe('the card about AI', () => {
  const seen = { ...none, ai: true }

  it('only when an AI assistant has sent a visitor or an AI crawler has read the site', () => {
    expect(eligible(none, fresh)).not.toContain('ai')
    expect(eligible(seen, fresh)).toEqual(['ai', 'replay', 'full', 'weekly', 'search'])
  })

  it('comes before the getting-started cards, and after the one about your own visits', () => {
    expect(eligible({ ...seen, exclude: true }, fresh).slice(0, 2)).toEqual(['exclude', 'ai'])
  })

  it('is the one card of its day, and the next one waits until tomorrow', () => {
    expect(pick(seen, fresh, '2026-10-02')).toBe('ai')
    const away = { done: ['ai' as const], day: '2026-10-02', id: 'ai' as const }
    expect(pick(seen, away, '2026-10-02')).toBeNull()
    expect(pick(seen, away, '2026-10-03')).toBe('replay')
  })

  it('never again once put away', () => {
    expect(eligible(seen, { done: ['ai'] })).not.toContain('ai')
    expect(pick(seen, { done: ['ai'] }, '2026-12-01')).toBe('replay')
  })

  it('is for a site of any age: past its first week only this one is left', () => {
    const old = { ...none, fresh: false }
    expect(eligible(old, fresh)).toEqual([])
    expect(eligible({ ...old, ai: true }, fresh)).toEqual(['ai'])
    expect(pick({ ...old, ai: true }, { done: ['ai'] }, '2026-12-01')).toBeNull()
  })
})

describe('what is remembered', () => {
  it('per site, for good', () => {
    expect(keptOf('tkb_a')).toEqual({ done: [] })
    remember('tkb_a', { done: ['full'], day: '2026-10-02', id: 'full' })
    expect(keptOf('tkb_a').done).toEqual(['full'])
    expect(keptOf('tkb_b').done).toEqual([])
  })

  it('what was used is per person, not per site', () => {
    expect(wasUsed('replay')).toBe(false)
    markUsed('replay')
    expect(wasUsed('replay')).toBe(true)
    expect(wasUsed('full')).toBe(false)
  })
})
