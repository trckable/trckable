import { describe, expect, it } from 'vitest'
import type { Share } from '../../lib/api'
import { DEFAULT_STYLE, linkPeriod, type Look } from './card'
import { linkFor, withCard } from './link'

const share = (o: Partial<Share>): Share => ({ id: 'a', site_id: 's', name: 'n', revenue: false, has_password: false, created_at: 0, views: 0, url: 'https://x.test/s/a', sections: ['pages', 'sources', 'places', 'tech'], ...o })
const now = Date.UTC(2026, 10, 1)

const card = { card: 'toppage', period: '30d' } as const
const mine = (o: Partial<Share> = {}) => share({ name: 'Share studio', sections: ['pages'], period: '30d', ...o })

describe('the period a link is fixed to', () => {
  it('is the card\'s own: a preset, a range of days, or all time from the first day', () => {
    expect(linkPeriod({ card: 'overview', period: '12mo' })).toBe('12mo')
    expect(linkPeriod({ card: 'overview', period: 'custom', from: '2026-03-01', to: '2026-06-14' })).toBe('2026-03-01..2026-06-14')
    expect(linkPeriod({ card: 'overview', period: 'all' }, '2024-02-04')).toBe('since:2024-02-04')
    expect(linkPeriod({ card: 'overview', period: 'all' })).toBe('all')
    expect(linkPeriod({ card: 'milestone', period: 'all' })).toBe('')
    expect(linkPeriod({ card: 'overview', period: 'custom' })).toBe('')
  })
  it('finds the link of an all-time card by its first day, and of a range by its days', () => {
    expect(linkFor([mine({ period: 'since:2024-02-04' })], { card: 'toppage', period: 'all' }, '2024-02-04', now)).toBeDefined()
    expect(linkFor([mine({ period: 'since:2024-02-04' })], { card: 'toppage', period: 'all' }, '2024-02-05', now)).toBeDefined()
    expect(linkFor([mine({ period: '30d' })], { card: 'toppage', period: 'all' }, '2024-02-04', now)).toBeUndefined()
    expect(linkFor([mine({ period: '2026-03-01..2026-06-14' })], { card: 'toppage', period: 'custom', from: '2026-03-01', to: '2026-06-14' }, undefined, now)).toBeDefined()
    expect(linkFor([mine({ period: '2026-03-01..2026-06-14' })], { card: 'toppage', period: 'custom', from: '2026-03-01', to: '2026-06-13' }, undefined, now)).toBeUndefined()
  })
})

describe('the link a card goes out with', () => {
  it('is the studio\'s own, open to anybody, with no revenue, not ended', () => {
    expect(linkFor([mine({ has_password: true }), mine({ revenue: true }), mine({ expires_at: 1 }), mine({ url: undefined })], card, undefined, now)).toBeUndefined()
    expect(linkFor([mine({ has_password: true }), mine({ id: 'ok' })], card, undefined, now)?.id).toBe('ok')
    expect(linkFor([mine({ expires_at: now / 1000 + 60, id: 'later' })], card, undefined, now)?.id).toBe('later')
  })
  it('is never a link made for anything else, which may show more', () => {
    expect(linkFor([share({ name: 'Board' })], { card: 'overview', period: '30d' }, undefined, now)).toBeUndefined()
    expect(linkFor([mine({ name: 'Board' })], card, undefined, now)).toBeUndefined()
  })
  it('shows exactly the sections of the card, no more and no fewer', () => {
    expect(linkFor([mine({ sections: ['pages', 'sources'] })], card, undefined, now)).toBeUndefined()
    expect(linkFor([mine({ sections: [] })], card, undefined, now)).toBeUndefined()
    expect(linkFor([mine({ sections: ['pages'] })], card, undefined, now)).toBeDefined()
    expect(linkFor([mine({ sections: [], period: '7d' })], { card: 'overview', period: '7d' }, undefined, now)).toBeDefined()
    expect(linkFor([mine({ sections: ['pages', 'sources', 'places', 'tech'], period: '30d' })], { card: 'changed', period: '30d' }, undefined, now)).toBeDefined()
    expect(linkFor([mine({ sections: ['places'], period: '' })], { card: 'milestone', ms: 'countries~10', period: '30d' }, undefined, now)).toBeDefined()
    expect(linkFor([mine({ sections: [], period: '' })], { card: 'milestone', ms: 'visitors~1000', period: '30d' }, undefined, now)).toBeDefined()
  })
  it('is for the card\'s period only', () => {
    expect(linkFor([mine({ period: '7d' })], card, undefined, now)).toBeUndefined()
    expect(linkFor([mine({ period: '' })], card, undefined, now)).toBeUndefined()
  })
  it('names the card in the address, so the page\'s preview is that card at that size', () => {
    const look: Look = { card: 'toppage', shape: 'portrait', period: '30d', ...DEFAULT_STYLE }
    const u = new URL(withCard('https://x.test/s/a', look))
    expect(u.pathname).toBe('/s/a')
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ t: 'toppage', shape: 'portrait', theme: 'dark', bg: 'solid' })
    expect(u.searchParams.has('period')).toBe(false) // the link keeps its own, on the server
  })
})
