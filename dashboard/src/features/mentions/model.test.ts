import { describe, expect, it } from 'vitest'
import type { Mention } from './api'
import { factsOf, jumpOf, placesOf, safeURL } from './model'

const NOW = 1_800_000_000
const m = (o: Partial<Mention> = {}): Mention => ({ id: 1, source: 'hn', url: 'https://news.ycombinator.com/item?id=1', title: 'Show HN', host: 'news.ycombinator.com', posted_at: NOW - 3 * 3600, found_at: NOW, visitors: 212, ...o })

describe('what the card says about a mention', () => {
  it('names the places that are searched, Product Hunt only when it is', () => {
    expect(placesOf(['hn', 'news'])).toBe('Hacker News and News & blogs')
    expect(placesOf(['hn', 'ph', 'news'])).toBe('Hacker News, Product Hunt, and News & blogs')
    expect(placesOf(['news'])).toBe('News & blogs')
  })

  it('lists who wrote it, how it did and when, front page first', () => {
    expect(factsOf(m({ front: true, author: 'maker1', points: 212 }), NOW)).toEqual(['Front page', 'by maker1', '212 points', '3 h ago'])
    expect(factsOf(m({ kind: 'comment', author: 'fan' }), NOW)).toEqual(['Comment', 'by fan', '3 h ago'])
    expect(factsOf(m({ source: 'ph', points: 321 }), NOW)).toContain('321 upvotes')
    expect(factsOf(m({ source: 'news', points: 5 }), NOW)).toEqual(['3 h ago'])
  })

  it('links only to web addresses', () => {
    expect(safeURL('https://a.example/x')).toBe('https://a.example/x')
    expect(safeURL('javascript:alert(1)')).toBeUndefined()
    expect(safeURL('data:text/html,x')).toBeUndefined()
  })

  it('writes a jump as a percentage of the usual', () => {
    expect(jumpOf(4.4)).toBe('340%')
    expect(jumpOf(2)).toBe('100%')
  })
})
