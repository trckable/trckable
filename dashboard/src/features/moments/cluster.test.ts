import { describe, expect, it } from 'vitest'
import { rowsOf, SHOWN, visibleRows } from './cluster'
import type { Pin, PinKind } from './pins'

const pin = (kind: PinKind, id: string): Pin => ({ id: `${kind}:${id}`, kind, score: 50, day: '2026-09-10', filters: [], showDay: true, n: {} })

describe('the rows beside the open pin', () => {
  it('leaves out the open one and keeps the order', () => {
    const rows = rowsOf([pin('spike', 'a'), pin('sale', 'b'), pin('ai', 'c')], 1)
    expect(rows.map((r) => (r.group ? 'group' : r.item.pin.id))).toEqual(['spike:a', 'ai:c'])
    expect(rows.map((r) => (r.group ? -1 : r.item.k))).toEqual([0, 2])
  })

  it('several milestones are one row, where the first stood; a single one is an ordinary row', () => {
    const list = [pin('spike', 'a'), pin('milestone', '1'), pin('sale', 'b'), pin('milestone', '2'), pin('milestone', '3')]
    const rows = rowsOf(list, 0)
    expect(rows).toHaveLength(2) // the group, then the sale
    expect(rows[0]).toMatchObject({ group: true })
    expect(rows[0].group && rows[0].items.map((i) => i.k)).toEqual([1, 3, 4])
    expect(rowsOf([pin('spike', 'a'), pin('milestone', '1')], 0).map((r) => r.group)).toEqual([false])
  })

  it('the open pin counts out of a group: two milestones with one open leave one ordinary row', () => {
    expect(rowsOf([pin('milestone', '1'), pin('milestone', '2')], 0).map((r) => r.group)).toEqual([false])
  })
})

describe('how many rows are shown', () => {
  const eight = Array.from({ length: 8 }, (_, k) => pin('sale', String(k)))

  it('three, then the number of pins behind "+N more"', () => {
    const { shown, hidden } = visibleRows(rowsOf(eight, 0), false)
    expect(shown).toHaveLength(SHOWN)
    expect(hidden).toBe(4)
  })

  it('all of them once opened, none hidden', () => {
    const { shown, hidden } = visibleRows(rowsOf(eight, 0), true)
    expect(shown).toHaveLength(7)
    expect(hidden).toBe(0)
  })

  it('a short list has no "+N more"', () => {
    expect(visibleRows(rowsOf(eight.slice(0, 4), 0), false).hidden).toBe(0)
  })

  it('a hidden group counts every pin in it', () => {
    const list = [pin('spike', 'a'), pin('spike', 'b'), pin('spike', 'c'), pin('spike', 'd'), pin('milestone', '1'), pin('milestone', '2'), pin('milestone', '3')]
    const { shown, hidden } = visibleRows(rowsOf(list, 0), false)
    expect(shown).toHaveLength(3)
    expect(hidden).toBe(3)
  })
})
