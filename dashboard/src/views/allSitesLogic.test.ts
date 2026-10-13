import { describe, expect, it } from 'vitest'
import type { Site, SiteRow } from '../lib/api'
import { fromStart, startIndex, wallOrder } from './allSitesLogic'

const r = (id: string, o: Partial<SiteRow> = {}) => ({ id, domain: id + '.com', name: '', visitors: 0, series: null, online: 0, ...o }) as SiteRow
const NOW = 1_800_000_000_000
const site = (id: string, o: Partial<Site> = {}) => ({ id, domain: id + '.com', name: '', ...o }) as Site

describe('All sites rules', () => {
  it('starts every sparkline at the earliest day with a visit', () => {
    const rows = [r('a', { series: [0, 0, 0, 2, 5] }), r('b', { series: [0, 0, 1, 0, 0] })]
    expect(startIndex(rows)).toBe(2)
    expect(fromStart(rows[0].series, 2)).toEqual([0, 2, 5])
  })
  it('keeps the whole period when data covers it, or there is none', () => {
    expect(startIndex([r('a', { series: [1, 0, 2] })])).toBe(0)
    expect(startIndex([r('a')])).toBe(0)
  })
  it('puts a quiet site first, then the most people online, then the most visitors', () => {
    const fresh = NOW / 1000 - 60
    const sites = [site('busy', { last_event_at: fresh }), site('calm', { last_event_at: fresh }), site('quiet', { last_event_at: NOW / 1000 - 9 * 3600 }), site('big', { last_event_at: fresh })]
    const rows = [r('busy', { online: 5 }), r('calm', { visitors: 1 }), r('quiet', { visitors: 9 }), r('big', { visitors: 50 })]
    expect(wallOrder(rows, sites, NOW).map((x) => x.id)).toEqual(['quiet', 'busy', 'big', 'calm'])
  })
})
