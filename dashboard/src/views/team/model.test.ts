import { describe, expect, it } from 'vitest'
import type { Site } from '../../lib/api'
import type { TeamRow } from '../../lib/apiMore'
import { briefing } from './briefing'
import { sorted, teamSite, totals } from './model'

const NOW = Date.UTC(2026, 9, 18, 12) // 18 Oct 2026, noon
const at = (hoursAgo: number) => Math.floor(NOW / 1000) - hoursAgo * 3600
const site = (id: string, o: Partial<Site> = {}): Site => ({ id, domain: id + '.com', name: id + '.com', last_event_at: at(0.01), ...o }) as Site
const row = (id: string, o: Partial<TeamRow> = {}): TeamRow => ({ id, today: 100, series: [1, 2, 100], online: 2, currency: 'USD', exponent: 2, ...o })

const team = () => [
  teamSite(site('a'), row('a', { today: 120, usual: 100, revenue: 5000 }), NOW),
  teamSite(site('b', { last_event_at: at(8) }), row('b', { today: 30, usual: 60, online: 0, revenue: 2500 }), NOW),
  teamSite(site('c', { last_event_at: undefined }), row('c', { today: 0, online: 0, series: [] }), NOW),
  teamSite(site('d'), { ...row('d'), error: 'took too long to load' }, NOW),
]

describe('a team site mark', () => {
  it('carries the site icon so the row can draw it', () => {
    expect(teamSite(site('a', { icon_url: '/i/a.png' }), undefined, NOW).icon_url).toBe('/i/a.png')
    expect(teamSite(site('b'), undefined, NOW).icon_url).toBeUndefined()
  })
})

describe('the team strip', () => {
  it('adds up the rows beside it and nothing else', () => {
    const t = totals(team())
    expect(t.today).toBe(150) // the site that could not be read has no number to add
    expect(t.online).toBe(2)
    expect(t.revenue).toEqual({ minor: 7500, currency: 'USD', exponent: 2 })
    expect(t.versus).toEqual({ today: 150, usual: 160 }) // only the rows that have a usual, on both sides
    expect(t.attention.map((s) => s.id)).toEqual(['c', 'b']) // not verified, then quiet
  })

  it('tells the team against its usual only when the sites with a usual hold most of today', () => {
    const lopsided = [teamSite(site('a'), row('a', { today: 10, usual: 5 }), NOW), teamSite(site('b'), row('b', { today: 90 }), NOW)]
    expect(totals(lopsided).versus).toBeNull()
    expect(briefing(lopsided)).toBe('100 visitors across the sites so far. Every site is fine.')
  })

  it('shows no revenue for two currencies, and none without a payment', () => {
    const mixed = [teamSite(site('a'), row('a', { revenue: 100 }), NOW), teamSite(site('b'), row('b', { revenue: 100, currency: 'EUR' }), NOW)]
    expect(totals(mixed).revenue).toBeNull()
    expect(totals([teamSite(site('a'), row('a'), NOW)]).revenue).toBeNull()
  })
})

describe('the order', () => {
  const ids = (by: Parameters<typeof sorted>[1]) => sorted(team(), by).map((s) => s.id)
  it('puts the sites that need a look first', () => expect(ids('attention')).toEqual(['c', 'b', 'a', 'd']))
  it('orders by traffic with unread sites last', () => expect(ids('traffic')).toEqual(['a', 'b', 'c', 'd']))
  it('orders by change, the worst first, sites with no usual last', () => expect(ids('change')).toEqual(['b', 'a', 'c', 'd']))
})

describe('the briefing', () => {
  it('says the pace against usual, then who needs a look', () => {
    expect(briefing(team())).toBe('The team is 6% below usual today. c.com and b.com need a look.')
  })
  it('says every site is fine when none needs a look', () => {
    expect(briefing([teamSite(site('a'), row('a', { usual: 100, today: 100 }), NOW)])).toBe('The team is on its usual pace today. Every site is fine.')
  })
})
