import { describe, expect, it } from 'vitest'
import type { Share } from '../../lib/api'
import { DEFAULT_STYLE, type Look } from './card'
import { linkFor, withCard } from './link'

const share = (o: Partial<Share>): Share => ({ id: 'a', site_id: 's', name: 'n', revenue: false, has_password: false, created_at: 0, views: 0, url: 'https://x.test/s/a', sections: ['pages', 'sources', 'places', 'tech'], ...o })
const now = Date.UTC(2026, 10, 1)

describe('the link a card goes out with', () => {
  it('is one anybody can open that shows no revenue and has not ended', () => {
    expect(linkFor([share({ has_password: true }), share({ revenue: true }), share({ expires_at: 1 }), share({ url: undefined })], '', now)).toBeUndefined()
    expect(linkFor([share({ has_password: true }), share({ id: 'ok' })], '', now)?.id).toBe('ok')
    expect(linkFor([share({ expires_at: now / 1000 + 60, id: 'later' })], '', now)?.id).toBe('later')
  })
  it('shows the section the card is drawn from', () => {
    expect(linkFor([share({ sections: [] })], 'pages', now)).toBeUndefined()
    expect(linkFor([share({ sections: [] })], '', now)).toBeDefined()
    expect(linkFor([share({ sections: ['sources'] })], 'sources', now)).toBeDefined()
  })
  it('names the card in the address, so the page\'s preview is that card at that size', () => {
    const look: Look = { card: 'toppage', shape: 'portrait', period: '30d', ...DEFAULT_STYLE }
    const u = new URL(withCard('https://x.test/s/a', look))
    expect(u.pathname).toBe('/s/a')
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ t: 'toppage', period: '30d', shape: 'portrait', theme: 'dark', bg: 'solid' })
  })
})
