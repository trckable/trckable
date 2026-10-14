import { describe, expect, it } from 'vitest'
import type { Mention } from './api'
import { filterOf, heroOf, openedOf, quoteParts, replyURL, sparkPoints } from './pageModel'

const m = (o: Partial<Mention>): Mention => ({ id: 1, source: 'hn', url: 'https://news.ycombinator.com/item?id=5', title: 'T', host: 'news.ycombinator.com', posted_at: 1000, found_at: 1000, visitors: 0, ...o })

describe('hero', () => {
  it('shows the mention driving visitors now, then the newest busy one inside a day', () => {
    const a = m({ id: 1, posted_at: 100_000 - 3600, visitors: 5 })
    const b = m({ id: 2, posted_at: 100_000 - 7200, visitors: 90 })
    expect(heroOf([a, b], null, 100_000)).toEqual({ kind: 'now', m: b })
    expect(heroOf([a, b], a, 100_000)).toEqual({ kind: 'now', m: a })
  })
  it('is a calm summary with the best one when nothing is fresh', () => {
    const a = m({ id: 1, posted_at: 10, visitors: 5 })
    const b = m({ id: 2, posted_at: 20, visitors: 90 })
    expect(heroOf([a, b], null, 10 ** 6)).toEqual({ kind: 'calm', count: 2, visitors: 95, best: b })
    expect(heroOf([], null, 10 ** 6)).toBeNull()
  })
})

describe('quote', () => {
  it('marks the searched words, whatever their case', () => {
    expect(quoteParts('I use Acme Metrics daily', ['acme metrics'])).toEqual([
      { text: 'I use ', hit: false },
      { text: 'Acme Metrics', hit: true },
      { text: ' daily', hit: false },
    ])
  })
  it('keeps to 280 characters around the first match and never reads a word as a pattern', () => {
    const long = 'x'.repeat(400) + ' site.com ' + 'y'.repeat(400)
    const parts = quoteParts(long, ['site.com'])
    expect(parts.map((p) => p.text).join('').length).toBeLessThanOrEqual(284)
    expect(parts.some((p) => p.hit)).toBe(true)
    expect(quoteParts('a.b', ['a.b'])[0].hit).toBe(true)
    expect(quoteParts('axb', ['a.b'])[0].hit).toBe(false)
  })
})

describe('lists and lines', () => {
  it('filters by source and finds the opened one', () => {
    const list = [m({ id: 1 }), m({ id: 2, source: 'news' })]
    expect(filterOf(list, 'news').map((x) => x.id)).toEqual([2])
    expect(filterOf(list, 'all')).toHaveLength(2)
    expect(openedOf(list, '?m=2')?.id).toBe(2)
    expect(openedOf(list, '?m=9')).toBeNull()
  })
  it('draws a line from first to last and offers a reply only on a Hacker News item', () => {
    expect(sparkPoints([0, 4, 2], 100, 20, 0)).toBe('0.0,20.0 50.0,0.0 100.0,10.0')
    expect(sparkPoints([3], 100, 20)).toBe('')
    expect(replyURL(m({}))).toBe('https://news.ycombinator.com/item?id=5')
    expect(replyURL(m({ source: 'news' }))).toBeUndefined()
  })
})
