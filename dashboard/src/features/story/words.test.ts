import { describe, expect, it } from 'vitest'
import type { Moment } from './moments'
import { wordsOf } from './words'

const spike = (o: Partial<Moment>): Moment => ({ t: '2026-09-28T00:00', kind: 'spike', ...o })

describe('how a spike reads in Replay', () => {
  it('with a usual: the multiplier, rounded', () => {
    expect(wordsOf(spike({ factor: 4.2, visitors: 816, referrer: 'news.example' })).line).toBe('Traffic 4.2×')
    expect(wordsOf(spike({ factor: 12, visitors: 816 })).line).toBe('Traffic 12×')
  })

  it('without one: new traffic, the count and who sent it', () => {
    const w = wordsOf(spike({ visitors: 230, referrer: 'news.example' }))
    expect(w.line).toBe('New traffic · 230 visitors')
    expect(w.sub).toBe('from news.example')
  })
})
