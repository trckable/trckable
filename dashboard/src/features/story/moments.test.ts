import { describe, expect, it } from 'vitest'
import { best, periodOf, place, type Moment } from './moments'

const labels = ['2026-09-27T00:00', '2026-09-28T00:00', '2026-09-29T00:00']
const list: Moment[] = [
  { t: '2026-09-28T00:00', kind: 'sale', count: 2, amount: 4900, channel: 'Search' },
  { t: '2026-09-28T00:00', kind: 'spike', factor: 3, referrer: 'news.example' },
  { t: '2026-09-29T00:00', kind: 'milestone', family: 'revenue', step: '1k', value: 1000 },
  { t: '2026-09-29T00:00', kind: 'country', country: 'DE' },
  { t: '2026-10-05T00:00', kind: 'note', text: 'outside' },
]

describe('place', () => {
  it('puts moments at their bucket and leaves out the ones off the chart', () => {
    const p = place(list, labels, true)
    expect(p.map((x) => x.i)).toEqual([1, 2])
    expect(p[0].moments).toHaveLength(2)
  })
  it('never shows money where revenue is hidden', () => {
    const p = place(list, labels, false)
    expect(p.flatMap((x) => x.moments.map((m) => m.kind))).toEqual(['spike', 'country'])
  })
})

describe('best', () => {
  it('names the busiest bucket, and nothing when there is none', () => {
    const hours = ['2026-09-27T19:00', '2026-09-27T20:00']
    expect(best(hours, [3, 9], 'hour')).toBe('20:00')
    expect(best(hours, [0, 0], 'hour')).toBe('')
  })
})

describe('periodOf', () => {
  it('writes a span short', () => {
    expect(periodOf(['2026-09-27', '2026-09-28'])).toBe('Sep 27–28')
    expect(periodOf(['2026-09-27', '2026-09-27'])).toBe('Sep 27')
    expect(periodOf(['2026-09-27', '2026-10-02'])).toBe('Sep 27 – Oct 2')
  })
})
