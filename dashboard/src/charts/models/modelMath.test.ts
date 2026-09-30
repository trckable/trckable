import { describe, expect, it } from 'vitest'
import { changePct, curve, foldLayers, isWeekend, modelTop, paceGap, running, stackEdges, stackTotals } from './modelMath'

describe('the models arithmetic', () => {
  it('draws a tiny range in straight lines and a long one as a curve', () => {
    const pts = (n: number) => Array.from({ length: n }, (_, i) => [i * 10, (i % 2) * 20])
    expect(curve(pts(4))).not.toContain('C')
    expect(curve(pts(5))).toContain('C')
    expect(curve(pts(1))).toBe('M0.0 0.0')
  })

  it('adds up a running total', () => {
    expect(running([3, 0, 2, 5])).toEqual([3, 3, 5, 10])
    expect(running([])).toEqual([])
  })

  it('knows a weekend only by the day', () => {
    expect(isWeekend('2026-09-26T00:00', true)).toBe(true) // Saturday
    expect(isWeekend('2026-09-27T00:00', true)).toBe(true) // Sunday
    expect(isWeekend('2026-09-28T00:00', true)).toBe(false)
    expect(isWeekend('2026-09-26T00:00', false)).toBe(false)
  })

  it('folds channels to the biggest few and one more for the rest', () => {
    const c = (name: string, values: number[]) => ({ name, color: name, values })
    const out = foldLayers([c('a', [1, 1]), c('b', [5, 5]), c('c', [3, 3]), c('d', [2, 2]), c('e', [1, 0]), c('f', [0, 1])], 4, { name: 'Other', color: 'grey' })
    expect(out.map((l) => l.name)).toEqual(['b', 'c', 'd', 'a', 'Other'])
    expect(out[4].values).toEqual([1, 1])
    // With no more than four channels there is nothing to fold.
    expect(foldLayers([c('a', [1]), c('b', [2])], 4, { name: 'Other', color: 'grey' }).map((l) => l.name)).toEqual(['b', 'a'])
  })

  it('stacks layers on each other', () => {
    const l = (values: number[]) => ({ name: '', color: '', values })
    const stack = [l([1, 2]), l([3, 0]), l([0, 4])]
    expect(stackEdges(stack, 2)).toEqual([[0, 0], [1, 2], [4, 2], [4, 6]])
    expect(stackTotals(stack, 2)).toEqual([4, 6])
  })

  it('scales each model to the tallest thing it draws', () => {
    const l = (values: number[]) => ({ name: '', color: '', values })
    expect(modelTop('A', [1, 5], [9, 2])).toBe(9)
    expect(modelTop('E', [1, 5], [9, 2])).toBe(11) // the period before, added up
    expect(modelTop('D', [1, 5], [], [l([1, 2]), l([0, 4])])).toBe(6)
    expect(modelTop('D', [1, 5], [])).toBe(5) // no layers yet: the plain numbers
  })

  it('says how far ahead or behind the pace is', () => {
    expect(paceGap([5, 5, 5], [4, 4, 4])).toBe(3)
    expect(paceGap([1, 1], [5, 5])).toBe(-8)
    expect(paceGap([], [])).toBe(0)
  })

  it('has no change against nothing', () => {
    expect(changePct(110, 100)).toBe(10)
    expect(changePct(50, 100)).toBe(-50)
    expect(changePct(5, 0)).toBeNull()
  })
})
