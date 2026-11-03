import { describe, expect, it } from 'vitest'
import { biggestMover, whyContext, WHY_ROWS } from './whyLine'
import type { Row } from './types'

const row = (name: string, v: number, c: number): Row => ({ val: name, name, v, c, st: '' })

describe('biggestMover', () => {
  it('picks the largest change, up or down', () => {
    const m = biggestMover([row('/a', 10, 9), row('/pricing', 121, 88), row('/b', 20, 40)])
    expect(m).toEqual({ name: '/pricing', now: 121, before: 88, delta: 33 })
    expect(biggestMover([row('/a', 10, 9), row('/b', 5, 60)])?.delta).toBe(-55)
  })
  it('is none when nothing moved or nothing was compared', () => {
    expect(biggestMover([row('/a', 5, 5)])).toBeNull()
    expect(biggestMover([{ ...row('/a', 5, 0), c: undefined as unknown as number }])).toBeNull()
    expect(biggestMover([])).toBeNull()
  })
})

describe('whyContext', () => {
  it('caps the rows and keeps only name and numbers', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ ...row(`/p${i}`, i + 2, i), cust: 3, rev: 900 }))
    const c = whyContext(rows, { metric: 'visitors', period: '2026-10-01 to 2026-10-30', compare: 'previous' })
    expect(c.rows).toHaveLength(WHY_ROWS)
    expect(Object.keys(c.rows[0]).sort()).toEqual(['before', 'delta', 'name', 'now'])
    expect(c.rows[0]).toEqual({ name: '/p0', now: 2, before: 0, delta: 2 })
  })
})
