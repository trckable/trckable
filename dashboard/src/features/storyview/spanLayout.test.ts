import { describe, expect, it } from 'vitest'
import { layoutLabels, LABEL_H } from './spanLayout'

const it1 = (id: string, center: number, width = 200, peak = 100) => ({ id, center, width, peak })

describe('layoutLabels', () => {
  it('centres a label on its days and keeps it inside the chart', () => {
    const [a, b, c] = layoutLabels([it1('a', 500), it1('b', 10), it1('c', 990)], 1000, 26).sort((x, y) => x.left - y.left)
    expect([a.left, b.left, c.left]).toEqual([0, 400, 800])
  })
  it('puts two that would touch one under the other when the line is low enough', () => {
    const out = layoutLabels([it1('a', 300, 200, 150), it1('b', 400, 200, 150)], 1000, 26)
    expect(out).toHaveLength(2)
    expect(out[0].top).toBeLessThan(out[1].top)
    expect(out[1].top).toBeGreaterThanOrEqual(26)
  })
  it('leaves the second off when the line is under it, rather than cover the line', () => {
    const out = layoutLabels([it1('a', 300, 200, 150), it1('b', 400, 200, 30)], 1000, 26)
    expect(out.map((l) => l.id)).toEqual(['a'])
  })
  it('two far apart share the lane', () => {
    const out = layoutLabels([it1('a', 150), it1('b', 800)], 1000, 26)
    expect(out.every((l) => l.top < 26)).toBe(true)
    expect(LABEL_H).toBeLessThanOrEqual(26)
  })
})
