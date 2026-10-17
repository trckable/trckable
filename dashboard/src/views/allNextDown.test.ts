import { describe, expect, it } from 'vitest'
import type { Site, SiteRow } from '../lib/api'
import { headline, items, ordered, whyLine } from './allNext'

const NOW = 1_800_000_000_000
const sec = NOW / 1000
const row = (id: string, domain: string): SiteRow => ({ id, domain, name: '', online: 6, visitors: 6, series: [3, 3, 3, 3, 3, 3, 3, 3, 6], error: '' }) as unknown as SiteRow
const site = (id: string, domain: string, o: Partial<Site> = {}): Site => ({ id, domain, name: '', timezone: 'UTC', currency: 'USD', proxy_key: '', last_event_at: sec - 30, ...o })

describe('All sites with a site the probe finds down', () => {
  const rows = [row('a', 'fine.example'), row('b', 'portalishkollor.al')]
  const sites = [site('a', 'fine.example'), site('b', 'portalishkollor.al', { down_since: sec - 3600, down_cause: 'No answer within 10 seconds' })]
  const list = items(rows, sites, new Map(), NOW)

  it('puts it under Needs attention, first, with the cause', () => {
    const down = list.find((i) => i.row.id === 'b')
    expect(down?.kind).toBe('attention')
    expect(ordered(list)[0].row.id).toBe('b')
    expect(down && whyLine(down, 'yesterday', NOW)).toMatch(/^Not answering since .+ · No answer within 10 seconds$/)
  })

  it('leads the headline with it and never says everything looks fine', () => {
    const h = headline(list, rows, NOW)
    expect(h.alarm).toMatch(/^portalishkollor\.al isn’t answering since /)
    expect(h.fine).toBe(false)
    expect(h.tail).not.toMatch(/look fine|looks fine/)
  })

  it('names the sites under their usual pace instead of saying all look fine', () => {
    const slow = (id: string, domain: string): SiteRow => ({ ...row(id, domain), series: [20, 20, 20, 20, 20, 20, 20, 20, 2] })
    const rs = [slow('a', 'one.example'), slow('b', 'two.example'), row('c', 'three.example')]
    const ss = rs.map((r) => site(r.id, r.domain, { timezone: 'UTC' }))
    const noon = Date.UTC(2027, 0, 15, 18, 0, 0)
    const list2 = items(rs, ss.map((s) => ({ ...s, last_event_at: noon / 1000 - 30 })), new Map(), noon)
    const h = headline(list2, rs, noon)
    expect(h.tail).toBe('one.example and two.example are lower than usual.')
    expect(h.fine).toBe(false)
  })

  it('still says all fine when nothing is down', () => {
    const ok = items(rows, [site('a', 'fine.example'), site('b', 'portalishkollor.al')], new Map(), NOW)
    const h = headline(ok, rows, NOW)
    expect(h.alarm).toBe('')
    expect(h.tail).toBe('All 2 sites look fine.')
  })
})
