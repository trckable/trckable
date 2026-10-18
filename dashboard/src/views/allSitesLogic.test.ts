import { describe, expect, it } from 'vitest'
import type { SiteRow } from '../lib/api'
import { fromStart, startIndex } from './allSitesLogic'
import { copy } from './allSitesCopy'

const r = (id: string, o: Partial<SiteRow> = {}) => ({ id, domain: id + '.com', name: '', visitors: 0, series: null, online: 0, ...o }) as SiteRow

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
})

describe('the head line of All sites', () => {
  it('says that only the charts follow the period when the numbers are today’s', () => {
    expect(copy.summary(copy.todayCharts(copy.periodLabel(7)), 'Visitors', copy.siteCount(4))).toBe('Today · charts: last 7 days · Visitors · 4 sites')
  })
})
