import { describe, expect, it } from 'vitest'
import type { SiteLayout, SiteRow } from '../lib/api'
import { blocksOf, totalsOf } from './allSitesGroups'

const r = (id: string, o: Partial<SiteRow> = {}) => ({ id, domain: id + '.com', name: id, visitors: 0, currency: 'EUR', exponent: 2, ...o }) as SiteRow
const layout = (groups: SiteLayout['groups']): SiteLayout => ({ order: [], pinned: [], groups })

describe('the groups of All sites', () => {
  it('puts each site in its group and the rest in Other, keeping the order given', () => {
    const blocks = blocksOf([r('c'), r('a'), r('b')], layout([{ name: 'Shops', sites: ['a', 'b'] }]), false)
    expect(blocks.map((b) => [b.name, b.rows.map((x) => x.id)])).toEqual([['Shops', ['a', 'b']], [null, ['c']]])
  })
  it('keeps an empty group, except while searching', () => {
    const l = layout([{ name: 'New', sites: [] }])
    expect(blocksOf([r('a')], l, false).map((b) => b.name)).toEqual(['New', null])
    expect(blocksOf([r('a')], l, true).map((b) => b.name)).toEqual([null])
  })
  it('adds visitors up, and revenue only in one currency', () => {
    expect(totalsOf([r('a', { visitors: 5, revenue: 100 }), r('b', { visitors: 7, revenue: 50 }), r('c', { visitors: 1 })])).toEqual({ visitors: 13, money: { amount: 150, currency: 'EUR', exponent: 2 } })
    expect(totalsOf([r('a', { revenue: 100 }), r('b', { revenue: 50, currency: 'USD' })]).money).toBeNull()
    expect(totalsOf([r('a', { revenue: 0 })]).money).toBeNull()
  })
})
