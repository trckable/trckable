import { describe, expect, it } from 'vitest'
import type { SiteRow } from '../../lib/api'
import { todayOf, totalOf } from './useToday'

const row = (id: string, o: Partial<SiteRow> = {}): SiteRow => ({ id, domain: id + '.example', name: id, visitors: 0, pageviews: 0, bounce_rate: 0, previous_visitors: 0, series: [1, 2, 3], online: 0, currency: 'USD', exponent: 2, ...o })

describe("the switcher's numbers", () => {
  it("take a site's today from the last day of its series", () => {
    const by = todayOf([row('a', { series: [5, 0, 42], online: 3 })])
    expect(by.get('a')).toEqual({ visitors: 42 })
  })

  it('have nothing for a site that could not be read or has no series', () => {
    const by = todayOf([row('a', { error: 'x' }), row('b', { series: null }), row('c', { series: [] })])
    expect(by.size).toBe(0)
  })

  it('add up to the totals beside All sites', () => {
    const by = todayOf([row('a', { series: [0, 10], online: 2 }), row('b', { series: [0, 5], online: 1 })])
    expect(totalOf(by)).toEqual({ visitors: 15 })
  })
})
