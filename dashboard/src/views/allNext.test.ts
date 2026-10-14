import { describe, expect, it } from 'vitest'
import type { Site, SiteRow } from '../lib/api'
import { hasBaseline, headline, items, MOVE, ordered } from './allNext'

const NOW = Date.UTC(2026, 9, 14, 12) // noon, so a good part of the day has passed
const row = (id: string, o: Partial<SiteRow> = {}) => ({ id, domain: id + '.com', name: '', visitors: 0, series: null, online: 0, ...o }) as SiteRow
const site = (id: string, o: Partial<Site> = {}) => ({ id, domain: id + '.com', timezone: 'UTC', ...o }) as Site
const live = (id: string) => ({ row: row(id, { series: [40, 40, 40, 40, 40, 40, 40, 40, 20], visitors: 300 }), site: site(id, { last_event_at: NOW / 1000 - 60 }) })
const fresh = (id: string) => ({ row: row(id), site: site(id) })
const down = (id: string) => ({ row: row(id), site: site(id, { last_event_at: NOW / 1000 - 86400, check: { at: NOW / 1000 - 10, error: 'refused' } }) })

function build(parts: { row: SiteRow; site: Site }[]) {
  const rows = parts.map((p) => p.row)
  return { rows, list: items(rows, parts.map((p) => p.site), new Map(), NOW) }
}

describe('sites still waiting for their first visit', () => {
  it('get their own group, never steady', () => {
    const { list } = build([fresh('a'), live('b')])
    expect(list.map((i) => i.kind)).toEqual(['setup', 'steady'])
  })

  it('come after sites that need attention and before steady ones', () => {
    const { list } = build([live('b'), fresh('a'), down('c')])
    expect(ordered(list).map((i) => i.row.id)).toEqual(['c', 'a', 'b'])
  })

  it('make an all-waiting headline that does not say the site looks fine', () => {
    const one = build([fresh('a')])
    expect(headline(one.list, one.rows, NOW)).toEqual({ alarm: '', lead: '1 site waiting for its first visit. Install the script to start.', tail: '', fine: false })
    const two = build([fresh('a'), fresh('b')])
    expect(headline(two.list, two.rows, NOW).lead).toBe('2 sites waiting for their first visit. Install the script to start.')
  })

  it('are added to a normal headline about the live sites', () => {
    const { list, rows } = build([fresh('a'), live('b')])
    const h = headline(list, rows, NOW)
    expect(h.lead).toMatch(/^20 visitors today/)
    expect(h.lead).not.toMatch(/across/)
    expect(h.tail).toBe('Your site looks fine. 1 waiting for the first visit.')
    expect(h.fine).toBe(true)
  })

  it('leave no comparison line when nothing has a day to compare with', () => {
    expect(hasBaseline(build([fresh('a')]).list)).toBe(false)
    expect(hasBaseline(build([live('b')]).list)).toBe(true)
  })
})

describe('groups from the real comparison', () => {
  // At noon the pace is half the reference day, so 40 by the day's end means 20 "usual" by now.
  const at = (id: string, today: number, o: Partial<Site> = {}) => ({ row: row(id, { series: [40, 40, 40, 40, 40, 40, 40, 40, today], visitors: 300 }), site: site(id, { last_event_at: NOW / 1000 - 60, ...o }) })
  const kindOf = (today: number) => build([at('a', today)]).list[0].kind

  it('uses a 15% line each way, edges included', () => {
    expect(MOVE).toBe(0.15)
    expect(kindOf(18)).toBe('steady') // 10% below
    expect(kindOf(17)).toBe('lower') // exactly 15% below
    expect(kindOf(22)).toBe('steady') // 10% above
    expect(kindOf(23)).toBe('busier') // exactly 15% above
  })

  it('calls a site 15 to 26% below the same time last week lower, never steady', () => {
    for (const today of [17, 16, 15]) expect(kindOf(today)).toBe('lower')
  })

  it('puts a dormant site under quiet, and a recently silent one under attention', () => {
    const dormant = { row: row('d'), site: site('d', { last_event_at: NOW / 1000 - 40 * 86400 }) }
    expect(build([dormant]).list[0].kind).toBe('quiet')
  })

  it('orders lower and busier before steady', () => {
    const { list } = build([at('s', 20), at('l', 10), at('b', 30)])
    expect(ordered(list).map((i) => i.row.id)).toEqual(['l', 'b', 's'])
  })
})
