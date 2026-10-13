import { describe, expect, it } from 'vitest'
import type { SiteRow } from '../lib/api'
import { revenueTotal } from './allLens'

const r = (o: Partial<SiteRow>) => ({ id: 'x', domain: 'x.com', name: '', visitors: 0, series: null, online: 0, currency: 'USD', exponent: 2, ...o }) as SiteRow

describe('revenue on All sites', () => {
  it('adds up what the sites were paid', () => {
    expect(revenueTotal([r({ revenue: 500 }), r({ revenue: 250 }), r({})])).toBe(750)
  })
  it('does not add up different currencies', () => {
    expect(revenueTotal([r({ revenue: 500 }), r({ revenue: 250, currency: 'EUR' })])).toBe(0)
  })
  it('leaves out a site that could not be read', () => {
    expect(revenueTotal([r({ revenue: 500 }), r({ revenue: 900, error: 'x' })])).toBe(500)
  })
})
