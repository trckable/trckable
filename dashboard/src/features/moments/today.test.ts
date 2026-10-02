import { describe, expect, it } from 'vitest'
import type { Pin, PinKind } from './pins'
import { MAX_ITEMS, MIN_SPIKE_VISITORS, pickToday, windowOf } from './today'

const pin = (kind: PinKind, score: number, over: Partial<Pin> = {}): Pin => ({ id: `${kind}:${score}`, kind, score, filters: [], showDay: false, n: {}, ...over })

describe('the window since the last visit', () => {
  it('is back to the last visit, but never fewer than a week', () => {
    expect(windowOf('2026-10-01', '2026-10-02')).toEqual({ from: '2026-09-26', to: '2026-10-02' })
    expect(windowOf(undefined, '2026-10-02')).toEqual({ from: '2026-09-26', to: '2026-10-02' })
  })

  it('and never more than a month', () => {
    expect(windowOf('2026-08-01', '2026-10-02')).toEqual({ from: '2026-09-03', to: '2026-10-02' })
    expect(windowOf('2026-09-10', '2026-10-02')).toEqual({ from: '2026-09-10', to: '2026-10-02' })
  })
})

describe('the one thing today', () => {
  it('ranks by how much it matters, and says at most three', () => {
    const got = pickToday([pin('referrer', 50), pin('move', 75), pin('drop', 95), pin('pays', 65), pin('sale', 70)])
    expect(got.map((p) => p.kind)).toEqual(['drop', 'move', 'sale'])
    expect(got).toHaveLength(MAX_ITEMS)
  })

  it('keeps the best of each kind, so three sales are not three cards', () => {
    const got = pickToday([pin('sale', 80), pin('sale', 70), pin('sale', 60), pin('move', 72)])
    expect(got.map((p) => p.id)).toEqual(['sale:80', 'move:72'])
  })

  it('a spike of a quiet site is not news: it needs the insights\' own floor of visitors', () => {
    const small = pin('spike', 90, { n: { visitors: MIN_SPIKE_VISITORS - 1 } })
    const big = pin('spike', 85, { id: 'big', n: { visitors: MIN_SPIKE_VISITORS } })
    expect(pickToday([small, big]).map((p) => p.id)).toEqual(['big'])
    expect(pickToday([small])).toEqual([])
  })

  it('nothing when nothing clears its floor', () => {
    expect(pickToday([])).toEqual([])
  })

  it('leaves out what it does not speak of: an AI assistant\'s first visit and milestones', () => {
    expect(pickToday([pin('ai', 99), pin('milestone', 99)])).toEqual([])
  })

  it('a finding with a day counts only if it came after the last visit', () => {
    const before = pin('drop', 95, { id: 'old', day: '2026-09-30' })
    const after = pin('referrer', 60, { id: 'new', day: '2026-10-01' })
    const undated = pin('move', 70, { id: 'move' })
    expect(pickToday([before, after, undated], '2026-09-30').map((p) => p.id)).toEqual(['move', 'new'])
    // On a first visit there is no last visit to be after.
    expect(pickToday([before], undefined).map((p) => p.id)).toEqual(['old'])
  })

  it('does not tell again what it said lately', () => {
    expect(pickToday([pin('move', 70), pin('pays', 65)], undefined, ['move:70']).map((p) => p.kind)).toEqual(['pays'])
  })
})
