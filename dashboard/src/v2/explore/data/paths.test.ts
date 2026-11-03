import { describe, expect, it } from 'vitest'
import type { PathRoute } from '../types'
import { FLOW_ROUTES, keyOf, layoutFlow } from './paths'

const r = (visits: number, ...steps: string[]): PathRoute => ({ steps, visits, converted: 0 })

describe('layoutFlow', () => {
  it('draws nothing without routes or room', () => {
    expect(layoutFlow([], 600, 260)).toEqual({ cols: 0, nodes: [], bands: [] })
    expect(layoutFlow([r(1, '/')], 10, 260)).toEqual({ cols: 0, nodes: [], bands: [] })
  })

  it('ends a short visit at Left, and a visit of three pages at its third', () => {
    const f = layoutFlow([r(10, '/', '/pricing', '/signup'), r(5, '/', '/blog'), r(3, '/pricing')], 600, 260)
    expect(f.bands.map((b) => b.d.length)).toEqual([2, 2, 1])
    const left = f.nodes.filter((n) => n.page === null)
    expect(left.map((n) => [n.col, n.visits])).toEqual([[1, 3], [2, 5]])
    expect(f.nodes.filter((n) => n.col === 2 && n.page !== null).map((n) => n.page)).toEqual(['/signup'])
  })

  it('makes a band as thick as its visits, on one scale, and a node as tall as its bands', () => {
    const f = layoutFlow([r(30, '/', '/a', '/b'), r(10, '/', '/c', '/d')], 600, 260)
    const first = f.nodes.find((n) => n.col === 0 && n.page === '/') as { h: number; visits: number }
    const a = f.nodes.find((n) => n.page === '/a') as { h: number }
    const c = f.nodes.find((n) => n.page === '/c') as { h: number }
    expect(first.visits).toBe(40)
    expect(a.h / c.h).toBeCloseTo(3)
    expect(first.h).toBeCloseTo(a.h + c.h)
  })

  it('keeps to the busiest routes and every node inside the box', () => {
    const routes = Array.from({ length: 20 }, (_, i) => r(100 - i, `/p${i}`, `/q${i}`, `/z${i}`))
    const f = layoutFlow(routes, 800, 260)
    expect(f.bands).toHaveLength(FLOW_ROUTES)
    expect(f.bands[0].key).toBe(keyOf(routes[0]))
    for (const n of f.nodes) {
      expect(n.y).toBeGreaterThanOrEqual(0)
      expect(n.x + 8).toBeLessThanOrEqual(800)
    }
  })
})
