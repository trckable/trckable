import { describe, expect, it } from 'vitest'
import type { Row } from '../../lib/api'
import { itemsOf, topOf } from './trending'

const rows = (o: Record<string, number>): Row[] => Object.entries(o).map(([value, visitors]) => ({ value, visitors }))
const names = (l: { value: string }[]) => l.map((i) => i.value)

describe('top of a breakdown', () => {
  it('is the most people now, ties by name', () => {
    expect(names(topOf(rows({ '/a': 3, '/c': 9, '/b': 9 }), rows({})))).toEqual(['/b', '/c', '/a'])
  })

  it('takes five rows, or as many as asked', () => {
    const cur = rows(Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`/p${i}`, 100 - i])))
    expect(topOf(cur, rows({}))).toHaveLength(5)
    expect(topOf(cur, rows({}), 4)).toHaveLength(4)
  })

  it('gives the percent against the period before', () => {
    const l = topOf(rows({ '/a': 30, '/b': 10 }), rows({ '/a': 10, '/b': 40 }))
    expect(l.map((i) => i.pct)).toEqual([200, -75])
  })

  it('a page with nothing before is new, never infinite', () => {
    const l = topOf(rows({ '/new': 30, '/old': 20 }), rows({ '/old': 20 }))
    expect(l[0]).toMatchObject({ value: '/new', pct: null, fresh: true })
  })

  it('a value cut from a full previous list is not called new', () => {
    const prev = rows(Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`/p${i}`, 50 - i])))
    const l = topOf(rows({ '/x': 100 }), prev)
    expect(l[0]).toMatchObject({ value: '/x', fresh: false, was: 41 })
  })

  it('empty lists give nothing', () => {
    expect(topOf(null, null)).toEqual([])
  })
})

describe('titles', () => {
  it('a page item carries the title from either period, a value without one has none', () => {
    const items = itemsOf([{ value: '/a', visitors: 9, title: 'Alpha' }, { value: '/b', visitors: 3 }], [{ value: '/c', visitors: 4, title: 'Gamma' }])
    const by = Object.fromEntries(items.map((i) => [i.value, i.title]))
    expect(by).toEqual({ '/a': 'Alpha', '/b': undefined, '/c': 'Gamma' })
  })
})
