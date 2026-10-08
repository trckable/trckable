import { describe, expect, it } from 'vitest'
import type { Placed } from './marks'
import type { Pin } from './pins'
import { afterOf, extraOf, groupSpans, pickSpans, usualOf } from './spans'

const spike = (day: string, ref: string, visitors: number, factor?: number, score = 83): Pin => ({ id: `spike:${day}`, kind: 'spike', score, day, at: `${day}T00:00`, filters: [{ dim: 'referrer', value: ref }], showDay: true, n: { visitors, factor, referrer: ref } })
const at = (i: number, pin: Pin): Placed => ({ i, pin })

describe('groupSpans', () => {
  it('joins days that follow each other, of the same kind and cause, into one moment', () => {
    const s = groupSpans([at(10, spike('2026-09-27', 'google.com', 2175)), at(11, spike('2026-09-28', 'google.com', 2850)), at(12, spike('2026-09-29', 'google.com', 2789))])
    expect(s).toHaveLength(1)
    expect([s[0].i0, s[0].i1, s[0].from, s[0].to, s[0].pins.length]).toEqual([10, 12, '2026-09-27', '2026-09-29', 3])
  })
  it('keeps another cause, a gap of a day, and another kind apart', () => {
    const s = groupSpans([
      at(10, spike('2026-09-27', 'google.com', 100)),
      at(11, spike('2026-09-28', 'bing.com', 100)),
      at(13, spike('2026-09-30', 'google.com', 100)),
      at(11, { ...spike('2026-09-28', 'google.com', 5), kind: 'sale', id: 'sale:x' }),
    ])
    expect(s).toHaveLength(4)
  })
  it('milestones and first visits are each their own, even on days that follow each other', () => {
    const ms = (day: string, step: string): Pin => ({ id: `milestone:visitors:${step}`, kind: 'milestone', score: 75, day, filters: [], showDay: true, n: { value: 1 } })
    expect(groupSpans([at(1, ms('2026-09-01', '250')), at(2, ms('2026-09-02', '500'))])).toHaveLength(2)
  })
  it('a fall in buyers is a downward moment; the rest go up', () => {
    const drop: Pin = { id: 'drop:/p', kind: 'drop', score: 95, day: '2026-10-03', filters: [{ dim: 'entry_page', value: '/p' }], showDay: false, n: { name: '/p' } }
    expect(groupSpans([at(20, drop)])[0].dir).toBe('down')
    expect(groupSpans([at(20, spike('2026-10-03', 'x.com', 9))])[0].dir).toBe('up')
  })
  it('speaks with its most important pin and ranks longer ones a little higher', () => {
    const [s] = groupSpans([at(1, spike('2026-09-01', 'g.com', 10, 3, 81)), at(2, spike('2026-09-02', 'g.com', 10, 3, 90))])
    expect(s.main.day).toBe('2026-09-02')
    expect(s.score).toBe(94)
  })
})

describe('pickSpans', () => {
  it('keeps the most important that do not overlap, in time order', () => {
    const a = groupSpans([at(1, spike('2026-09-01', 'a.com', 1, 2, 70))])
    const b = groupSpans([at(1, spike('2026-09-01', 'b.com', 1, 2, 99)), at(2, spike('2026-09-02', 'b.com', 1, 2, 99))])
    const c = groupSpans([at(5, spike('2026-09-05', 'c.com', 1, 2, 80))])
    const picked = pickSpans([...a, ...b, ...c], 3)
    expect(picked.map((s) => s.i0)).toEqual([1, 5])
    expect(pickSpans([...a, ...b, ...c], 1)[0].main.filters[0].value).toBe('b.com')
  })
})

describe('figures', () => {
  const [span] = groupSpans([at(10, spike('2026-09-27', 'g.com', 900, 3)), at(11, spike('2026-09-28', 'g.com', 600, 3))])
  it('the extra is what the days had above their usual', () => {
    expect(extraOf(span)).toBe(1000)
    expect(usualOf(span)).toBe(500)
  })
  it('new traffic (no usual) is all of it, and has no usual to compare', () => {
    const [s] = groupSpans([at(1, spike('2026-09-01', 'g.com', 2175))])
    expect(extraOf(s)).toBe(2175)
    expect(usualOf(s)).toBeUndefined()
  })
  it('what came after: still high, or back to normal', () => {
    const v = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 900, 600, 700, 650, 640]
    expect(afterOf(span, v)).toEqual({ each: 663, kept: true })
    expect(afterOf(span, [...v.slice(0, 12), 240, 260, 250])).toEqual({ each: 250, kept: false })
    expect(afterOf(span, v.slice(0, 12))).toBeUndefined()
  })
})
