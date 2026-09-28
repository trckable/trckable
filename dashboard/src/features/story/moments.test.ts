import { describe, expect, it } from 'vitest'
import { best, neighbour, periodOf, place, salesIn, summaryLine, type Moment } from './moments'

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
    expect(salesIn(p)).toBe(0)
  })
})

describe('neighbour', () => {
  const p = place(list, labels, true)
  it('jumps to the next and the previous moment', () => {
    expect(neighbour(p, 0, 1)).toBe(1)
    expect(neighbour(p, 1, 1)).toBe(2)
    expect(neighbour(p, 2, 1)).toBeNull()
    expect(neighbour(p, 2, -1)).toBe(1)
    expect(neighbour(p, 1, -1)).toBeNull()
  })
})

describe('summary', () => {
  it('names the best hour, the top source and the sales', () => {
    const hours = ['2026-09-27T19:00', '2026-09-27T20:00']
    expect(best(hours, [3, 9], 'hour')).toBe('20:00')
    expect(best(hours, [0, 0], 'hour')).toBe('')
    expect(summaryLine({ period: 'Sep 27–28', visitors: '1,487', best: '20:00', bucket: 'hour', source: 'Google', sales: 2 })).toBe('Sep 27–28: 1,487 visitors, best hour 20:00, top source Google, 2 sales')
    expect(summaryLine({ period: 'Sep 27', visitors: '3', best: '', bucket: 'day' })).toBe('Sep 27: 3 visitors')
  })
})

describe('periodOf', () => {
  it('writes a span short', () => {
    expect(periodOf(['2026-09-27', '2026-09-28'])).toBe('Sep 27–28')
    expect(periodOf(['2026-09-27', '2026-09-27'])).toBe('Sep 27')
    expect(periodOf(['2026-09-27', '2026-10-02'])).toBe('Sep 27 – Oct 2')
  })
})
