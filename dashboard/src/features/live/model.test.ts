import { describe, expect, it } from 'vitest'
import type { Visit } from '../../lib/api'
import type { LiveNow, NowVisit } from './api'
import { feedOf, IDLE_MS, keyOf, MAX_ROWS, MINUTE, pct, seriesAt, sharesOf, shiftTo, withVisits } from './model'

const T0 = Date.UTC(2026, 8, 27, 12, 0, 0) // a whole minute
const pv = (ts: number, o: Partial<Visit> = {}): Visit => ({ kind: 'pageview', ts, path: '/', ...o })
const here = (ts: number, last: number, o: Partial<NowVisit> = {}): NowVisit => ({ kind: 'pageview', ts, last, path: '/', ...o })

function answer(o: Partial<LiveNow> = {}): LiveNow {
  return { at: T0 + 20_000, start: T0 - 29 * MINUTE, minutes: Array.from({ length: 30 }, (_, i) => i), online: 0, visitors: 0, previous: 0, sources: [], recent: [], ...o }
}

describe('the chart’s minutes', () => {
  it('stays put inside the same minute', () => {
    const s = { start: T0 - 29 * MINUTE, minutes: [1, 2, 3] }
    expect(shiftTo({ start: T0 - 2 * MINUTE, minutes: [1, 2, 3] }, T0 + 59_000).minutes).toEqual([1, 2, 3])
    expect(shiftTo(s, T0 - 40 * MINUTE)).toBe(s) // never back
  })

  it('moves on a minute at a time, empty minutes joining on the right', () => {
    const s = shiftTo({ start: T0 - 2 * MINUTE, minutes: [1, 2, 3] }, T0 + MINUTE + 5)
    expect(s).toEqual({ start: T0 - MINUTE, minutes: [2, 3, 0] })
    expect(shiftTo({ start: T0 - 2 * MINUTE, minutes: [1, 2, 3] }, T0 + 10 * MINUTE)).toEqual({ start: T0 + 8 * MINUTE, minutes: [0, 0, 0] })
  })

  it('counts only pageviews the answer did not, each in its own minute', () => {
    const s = { start: T0 - 2 * MINUTE, minutes: [0, 0, 5] }
    const at = T0 + 10_000
    const out = withVisits(s, [pv(T0 + 30_000), pv(T0 + 11_000), pv(T0 + 9_000), pv(T0 - MINUTE + 1, {}), { kind: 'goal', ts: T0 + 40_000, goal: 'x' }, pv(T0 - 5 * MINUTE)], at)
    expect(out.minutes).toEqual([0, 0, 7])
    expect(withVisits(s, [pv(T0)], at)).toBe(s) // nothing new: the same object
  })

  it('lays the stream over the answer at the server’s time now', () => {
    const a = answer()
    const out = seriesAt(a, [pv(T0 + 30_000)], T0 + MINUTE + 1000)
    expect(out).toHaveLength(30)
    expect(out.slice(0, 3)).toEqual([1, 2, 3])
    expect(out[28]).toBe(29 + 1) // the old current minute, with the new visit
    expect(out[29]).toBe(0) // the new minute
  })
})

describe('who is on the site', () => {
  it('puts newer stream visits on top, a known visitor moving up', () => {
    const recent = [here(T0, T0 + 5000, { visitor: 'a', path: '/a' }), here(T0 - 1000, T0, { visitor: 'b', path: '/b' })]
    const at = T0 + 10_000
    // Newest first, like useLive's list.
    const visits = [pv(T0 + 30_000, { visitor: 'c', path: '/c' }), pv(T0 + 20_000, { visitor: 'b', path: '/b2' }), pv(T0 + 5000, { visitor: 'a', path: '/old' })]
    const rows = feedOf(recent, visits, at, T0 + 40_000)
    expect(rows.map((r) => [r.visitor, r.path])).toEqual([
      ['c', '/c'],
      ['b', '/b2'],
      ['a', '/a'], // the stream's older visit is already in the answer
    ])
    expect(rows[1].last).toBe(T0 + 20_000)
  })

  it('without visitor ids, every visit is its own row', () => {
    const rows = feedOf([here(T0, T0, { path: '/x' })], [pv(T0 + 20_000, { path: '/x' })], T0 + 1, T0 + 30_000)
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((r) => r.key)).size).toBe(2)
    expect(keyOf(pv(1, { visitor: 'z' }))).toBe('v:z')
  })

  it('lets go of anyone idle for five minutes', () => {
    const recent = [here(T0, T0, { visitor: 'a' }), here(T0 - MINUTE, T0 + 2 * MINUTE, { visitor: 'b' })]
    expect(feedOf(recent, [], T0, T0 + IDLE_MS - 1).map((r) => r.visitor)).toEqual(['a', 'b'])
    expect(feedOf(recent, [], T0, T0 + IDLE_MS).map((r) => r.visitor)).toEqual(['b'])
    expect(feedOf(recent, [], T0, T0 + 2 * MINUTE + IDLE_MS)).toEqual([])
  })

  it('keeps the list to its length', () => {
    const recent = Array.from({ length: MAX_ROWS + 5 }, (_, i) => here(T0 - i, T0, { visitor: 'v' + String(i) }))
    expect(feedOf(recent, [], T0, T0)).toHaveLength(MAX_ROWS)
  })
})

describe('the sources bar', () => {
  it('shows the top three and the rest as other, as shares of all', () => {
    const { parts, other } = sharesOf([
      { channel: 'Search', visitors: 5 },
      { channel: 'Direct', visitors: 3 },
      { channel: 'AI', visitors: 1 },
      { channel: 'Email', visitors: 1 },
    ])
    expect(parts.map((p) => [p.channel, p.share])).toEqual([
      ['Search', 0.5],
      ['Direct', 0.3],
      ['AI', 0.1],
    ])
    expect(other).toBeCloseTo(0.1)
    expect(sharesOf([])).toEqual({ parts: [], other: 0 })
  })

  it('never says 0% for a part that is there', () => {
    expect(pct(0.004)).toBe('<1%')
    expect(pct(0.316)).toBe('32%')
    expect(pct(0)).toBe('0%')
  })
})
