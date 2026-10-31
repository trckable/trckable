import { describe, expect, it } from 'vitest'
import { cardRows, changeOf, conversionOf, funnelRow, goalRows, MAX_CARDS } from './model'

const g = (value: string, visitors: number, label?: string) => ({ value, visitors, label })

describe('goalRows', () => {
  it('orders the goals by how many reached them and names them as people read them', () => {
    const rows = goalRows([g('signup', 5, 'Signed up'), g('form_submit', 40), g('outbound_click', 12)], undefined)
    expect(rows.map((r) => r.name)).toEqual(['Form submissions', 'Outbound clicks', 'Signed up'])
    expect(rows.map((r) => r.amount)).toEqual([40, 12, 5])
    expect(rows.map((r) => r.kind)).toEqual(['form', 'goal', 'goal'])
  })

  it('has no arrow when the period before is not compared', () => {
    expect(goalRows([g('a', 5)], undefined)[0].change).toBeNull()
  })

  it('says up and down in whole percent against the period before', () => {
    const rows = goalRows([g('a', 150), g('b', 60)], [g('a', 100), g('b', 100)])
    expect(rows[0].change).toEqual({ dir: 'up', pct: 50 })
    expect(rows[1].change).toEqual({ dir: 'down', pct: 40 })
  })

  it('says nothing of a goal nobody reached before, and calls an even one flat', () => {
    const rows = goalRows([g('a', 5), g('b', 10)], [g('b', 10)])
    expect(rows.find((r) => r.value === 'a')?.change).toBeNull()
    expect(rows.find((r) => r.value === 'b')?.change).toEqual({ dir: 'flat', pct: 0 })
  })

  it('is empty without goals', () => {
    expect(goalRows(null, undefined)).toEqual([])
    expect(goalRows([], [])).toEqual([])
  })
})

describe('funnelRow', () => {
  const steps = [{ v: 100, c: 100 }, { v: 40, c: 50 }, { v: 5, c: 10 }]

  it('is the share who reach the last step, set against the share before', () => {
    expect(conversionOf(steps)).toBe(0.05)
    const r = funnelRow({ name: 'Signup', steps }, true)
    expect(r).toMatchObject({ kind: 'funnel', name: 'Signup', unit: 'rate', amount: 0.05 })
    expect(r?.change).toEqual({ dir: 'down', pct: 50 })
  })

  it('has no arrow when not compared, and no row when nobody entered', () => {
    expect(funnelRow({ name: 'Signup', steps }, false)?.change).toBeNull()
    expect(funnelRow({ name: 'Signup', steps: [{ v: 0, c: 3 }, { v: 0, c: 1 }] }, true)).toBeNull()
    expect(funnelRow(null, true)).toBeNull()
  })
})

describe('cardRows', () => {
  const many = goalRows([g('a', 9), g('b', 8), g('c', 7), g('d', 6), g('e', 5)], undefined)

  it('shows four goals at most', () => {
    expect(cardRows(many, null).map((r) => r.value)).toEqual(['a', 'b', 'c', 'd'])
    expect(cardRows(many, null)).toHaveLength(MAX_CARDS)
  })

  it('puts the funnel last and keeps the top three goals with it', () => {
    const f = funnelRow({ name: 'Signup', steps: [{ v: 10, c: 0 }, { v: 2, c: 0 }] }, true)
    const rows = cardRows(many, f)
    expect(rows.map((r) => r.kind)).toEqual(['goal', 'goal', 'goal', 'funnel'])
    expect(rows.map((r) => r.value).slice(0, 3)).toEqual(['a', 'b', 'c'])
  })

  it('is empty with no goals and no funnel', () => {
    expect(cardRows([], null)).toEqual([])
  })
})

describe('changeOf', () => {
  it('rounds to whole percent', () => {
    expect(changeOf(103, 100)).toEqual({ dir: 'up', pct: 3 })
    expect(changeOf(600, 1000)).toEqual({ dir: 'down', pct: 40 })
  })
})
