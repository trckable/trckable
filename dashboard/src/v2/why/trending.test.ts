import { describe, expect, it } from 'vitest'
import type { Row } from '../../lib/api'
import { listOf, MIN_COUNT } from './trending'

const rows = (o: Record<string, number>): Row[] => Object.entries(o).map(([value, visitors]) => ({ value, visitors }))
const names = (l: { value: string }[]) => l.map((i) => i.value)

describe('trending', () => {
  it('top is the most visitors now, ties by name', () => {
    expect(names(listOf('top', rows({ '/a': 3, '/c': 9, '/b': 9 }), rows({})))).toEqual(['/b', '/c', '/a'])
  })

  it('takes five rows', () => {
    const cur = rows(Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`/p${i}`, 100 - i])))
    expect(listOf('top', cur, rows({}))).toHaveLength(5)
  })

  it('up and down rank by the visitors gained or lost and give the percent', () => {
    const cur = rows({ '/a': 30, '/b': 10, '/c': 50 })
    const prev = rows({ '/a': 10, '/b': 40, '/c': 45 })
    const up = listOf('up', cur, prev)
    expect(names(up)).toEqual(['/a', '/c'])
    expect(up[0].pct).toBe(200)
    const down = listOf('down', cur, prev)
    expect(names(down)).toEqual(['/b'])
    expect(down[0].pct).toBe(-75)
  })

  it('ignores a value under the minimum in both periods, keeps one that reaches it in either', () => {
    const cur = rows({ '/tiny': MIN_COUNT - 1, '/grew': MIN_COUNT })
    const prev = rows({ '/tiny': 1, '/gone': MIN_COUNT, '/grew': 1 })
    expect(names(listOf('up', cur, prev))).toEqual(['/grew'])
    const down = listOf('down', cur, prev)
    expect(names(down)).toEqual(['/gone'])
    expect(down[0].pct).toBe(-100)
  })

  it('a page with nothing before is new, never infinite', () => {
    const l = listOf('up', rows({ '/new': 20, '/old': 30 }), rows({ '/old': 20 }))
    expect(l[0]).toMatchObject({ value: '/new', pct: null, fresh: true })
  })

  it('ties break by percent, then size, then name', () => {
    const cur = rows({ '/b': 20, '/a': 20, '/c': 30 })
    const prev = rows({ '/b': 10, '/a': 10, '/c': 20 })
    expect(names(listOf('up', cur, prev))).toEqual(['/a', '/b', '/c'])
  })

  it('a value cut from a full previous list is not called new', () => {
    const prev = rows(Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`/p${i}`, 50 - i])))
    const l = listOf('up', rows({ '/x': 100 }), prev)
    expect(l[0]).toMatchObject({ value: '/x', fresh: false, was: 41 })
  })

  it('empty lists give nothing', () => {
    expect(listOf('down', null, null)).toEqual([])
  })
})
