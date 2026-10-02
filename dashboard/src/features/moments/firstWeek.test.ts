// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { eligible, FIRST_WEEK_S, inFirstWeek, keptOf, pick, remember, type Known } from './firstWeek'
import { markUsed, wasUsed } from './store'

afterEach(() => localStorage.clear())

const none: Known = { replayed: false, fullOpened: false, weekly: false, search: false }
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
    expect(eligible({ replayed: true, fullOpened: true, weekly: true, search: false }, fresh)).toEqual(['search'])
    expect(eligible({ replayed: true, fullOpened: true, weekly: true, search: true }, fresh)).toEqual([])
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
