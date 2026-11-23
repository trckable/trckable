import { describe, expect, it } from 'vitest'
import type { Share } from '../../lib/api'
import { DEFAULT_STYLE, type Look } from './card'
import { linkFor, linkable, withCard } from './link'

const share = (o: Partial<Share>): Share => ({ id: 'a', site_id: 's', name: 'n', revenue: false, has_password: false, created_at: 0, views: 0, url: 'https://x.test/s/a', sections: ['pages', 'sources', 'places', 'tech'], ...o })
const now = Date.UTC(2026, 10, 1)

const card = { card: 'toppage', period: '30d' } as const
const mine = (o: Partial<Share> = {}) => share({ name: 'Share studio', sections: ['pages'], period: '30d', ...o })

describe('when a card can have a link', () => {
  it('waits while it is for all time, which no link shows', () => {
    expect(linkable({ card: 'toppage', period: 'all' })).toBe(false)
    expect(linkable({ card: 'overview', period: '30d' })).toBe(true)
    expect(linkable({ card: 'milestone', period: 'all' })).toBe(true)
  })
})

describe('the link a card goes out with', () => {
  it('is the studio\'s own, open to anybody, with no revenue, not ended', () => {
    expect(linkFor([mine({ has_password: true }), mine({ revenue: true }), mine({ expires_at: 1 }), mine({ url: undefined })], card, now)).toBeUndefined()
    expect(linkFor([mine({ has_password: true }), mine({ id: 'ok' })], card, now)?.id).toBe('ok')
    expect(linkFor([mine({ expires_at: now / 1000 + 60, id: 'later' })], card, now)?.id).toBe('later')
  })
  it('is never a link made for anything else, which may show more', () => {
    expect(linkFor([share({ name: 'Board' })], { card: 'overview', period: '30d' }, now)).toBeUndefined()
    expect(linkFor([mine({ name: 'Board' })], card, now)).toBeUndefined()
  })
  it('shows exactly the sections of the card, no more and no fewer', () => {
    expect(linkFor([mine({ sections: ['pages', 'sources'] })], card, now)).toBeUndefined()
    expect(linkFor([mine({ sections: [] })], card, now)).toBeUndefined()
    expect(linkFor([mine({ sections: ['pages'] })], card, now)).toBeDefined()
    expect(linkFor([mine({ sections: [], period: '7d' })], { card: 'overview', period: '7d' }, now)).toBeDefined()
    expect(linkFor([mine({ sections: ['pages', 'sources', 'places', 'tech'], period: '30d' })], { card: 'changed', period: '30d' }, now)).toBeDefined()
    expect(linkFor([mine({ sections: ['places'], period: '' })], { card: 'milestone', ms: 'countries~10', period: '30d' }, now)).toBeDefined()
    expect(linkFor([mine({ sections: [], period: '' })], { card: 'milestone', ms: 'visitors~1000', period: '30d' }, now)).toBeDefined()
  })
  it('is for the card\'s period only', () => {
    expect(linkFor([mine({ period: '7d' })], card, now)).toBeUndefined()
    expect(linkFor([mine({ period: '' })], card, now)).toBeUndefined()
  })
  it('names the card in the address, so the page\'s preview is that card at that size', () => {
    const look: Look = { card: 'toppage', shape: 'portrait', period: '30d', ...DEFAULT_STYLE }
    const u = new URL(withCard('https://x.test/s/a', look))
    expect(u.pathname).toBe('/s/a')
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ t: 'toppage', period: '30d', shape: 'portrait', theme: 'dark', bg: 'solid' })
  })
})
