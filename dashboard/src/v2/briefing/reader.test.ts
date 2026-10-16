import { describe, expect, it } from 'vitest'
import type { Visit } from '../../lib/api'
import { readerOf, readerWords } from './reader'

const v = (visitor: string, ts: number, path: string, extra: Partial<Visit> = {}): Visit => ({ kind: 'pageview', ts, visitor, path, ...extra })

describe('meet one of them', () => {
  it('is nobody without a visitor who read more than one page', () => {
    expect(readerOf([v('a', 1, '/')], 'x.com')).toBeNull()
    expect(readerOf([], 'x.com')).toBeNull()
  })
  it('prefers a visitor sent by the source that jumped', () => {
    const r = readerOf([v('a', 1, '/', { referrer: 'google.com', city: 'Berlin' }), v('a', 2, '/docs'), v('b', 3, '/', { referrer: 'news.ycombinator.com', city: 'Brooklyn' }), v('b', 4, '/pricing')], 'x.com', 'news.ycombinator.com')
    expect(r).toMatchObject({ where: 'Brooklyn', pages: 2, last: '/pricing' })
    expect(readerWords(r as NonNullable<typeof r>)).toBe('someone in Brooklyn, who found you through Hacker News, read 2 pages and finished on /pricing')
  })
  it('falls back to the latest reader, and names the country when the city is not known', () => {
    const r = readerOf([v('a', 1, '/', { country: 'DE' }), v('a', 2, '/docs')], 'x.com')
    expect(r?.where).toBe('Germany')
    expect(r?.via).toBeUndefined()
  })
})
