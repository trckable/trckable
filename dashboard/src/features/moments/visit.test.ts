// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { markShown, putAway, roll, toldLately, visitOf } from './visit'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('the last visit', () => {
  it('the first visit has no "since"', () => {
    expect(roll(null, '2026-10-02')).toEqual({ cur: '2026-10-02' })
  })

  it('a new day makes the last day seen the one before, and forgets a card put away', () => {
    expect(roll({ cur: '2026-10-01', gone: '2026-10-01', shown: '2026-10-01' }, '2026-10-02')).toEqual({ prev: '2026-10-01', cur: '2026-10-02', told: undefined })
  })

  it('a reload the same day keeps what it read, so the card still says "since" the same time', () => {
    const first = visitOf('tkb_a', '2026-10-02')
    expect(visitOf('tkb_a', '2026-10-02')).toEqual(first)
    expect(visitOf('tkb_a', '2026-10-03').prev).toBe('2026-10-02')
    expect(visitOf('tkb_a', '2026-10-03').prev).toBe('2026-10-02')
  })

  it('is per site', () => {
    visitOf('tkb_a', '2026-10-01')
    expect(visitOf('tkb_b', '2026-10-02').prev).toBeUndefined()
  })
})

describe('put away for the day', () => {
  it('stays away on a reload, and is back the next day', () => {
    visitOf('tkb_a', '2026-10-02')
    putAway('tkb_a', '2026-10-02')
    expect(visitOf('tkb_a', '2026-10-02').gone).toBe('2026-10-02')
    expect(visitOf('tkb_a', '2026-10-03').gone).toBeUndefined()
  })
})

describe('what was told', () => {
  it('is not told again for a week, but today\'s is still on the card', () => {
    visitOf('tkb_a', '2026-10-02')
    markShown('tkb_a', '2026-10-02', ['move:Social'])
    expect(toldLately(visitOf('tkb_a', '2026-10-02'), '2026-10-02')).toEqual([])
    expect(toldLately(visitOf('tkb_a', '2026-10-03'), '2026-10-03')).toEqual(['move:Social'])
    expect(toldLately(visitOf('tkb_a', '2026-10-09'), '2026-10-09')).toEqual([])
  })
})

describe('a browser that will not store it', () => {
  it('never throws, and the card just shows again', () => {
    const deny = () => {
      throw new Error('denied')
    }
    vi.stubGlobal('localStorage', { getItem: deny, setItem: deny })
    expect(() => visitOf('tkb_a', '2026-10-02')).not.toThrow()
    expect(() => putAway('tkb_a', '2026-10-02')).not.toThrow()
    expect(visitOf('tkb_a', '2026-10-02')).toEqual({ cur: '2026-10-02' })
  })
})
