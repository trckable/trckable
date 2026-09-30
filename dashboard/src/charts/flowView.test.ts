import { describe, expect, it } from 'vitest'
import { flowInputs, labelled, pageColors, type FlowCol } from './flowView'

const col = (...n: [string, number, FlowCol['kind']?][]): FlowCol[] => n.map(([key, value, kind]) => ({ key, label: key, value, kind: kind ?? 'page' }))

describe('the page flow', () => {
  it('draws Other pages no taller than the busiest page, and Left the site smaller still', () => {
    const [c] = flowInputs([col(['/', 100], ['/docs', 40], ['(other)', 300, 'other'], ['(exit)', 500, 'exit'])])
    expect(c.map((n) => n.weight)).toEqual([undefined, undefined, 100, 60])
    expect(c.map((n) => n.value)).toEqual([100, 40, 300, 500]) // the counts are never touched
  })
  it('leaves a small catch-all and a column with no real page as they are', () => {
    const [c] = flowInputs([col(['/', 100], ['(other)', 10, 'other'])])
    expect(c[1].weight).toBe(10)
    const [d] = flowInputs([col(['(exit)', 7, 'exit'])])
    expect(d[0].weight).toBeUndefined()
  })
  it('gives a page the same colour in every column, in fixed order', () => {
    const m = pageColors([col(['/', 5], ['/docs', 3], ['(exit)', 1, 'exit']), col(['/docs', 2], ['/', 2], ['/new', 1])])
    expect([...m.entries()]).toEqual([
      ['/', 'var(--ch-1)'],
      ['/docs', 'var(--ch-2)'],
      ['/new', 'var(--ch-3)'],
    ])
  })
  it('keeps the eighth page neutral instead of cycling the palette', () => {
    const m = pageColors([col(...Array.from({ length: 8 }, (_, i): [string, number] => [`/p${i}`, 1]))])
    expect(m.get('/p6')).toBe('var(--ch-7)')
    expect(m.get('/p7')).toBe('var(--text-3)')
  })
  it('names the tall nodes and skips one that would sit on the last name', () => {
    expect(labelled([{ y: 0, h: 40 }, { y: 44, h: 4 }, { y: 52, h: 30 }, { y: 60, h: 20 }])).toEqual([true, false, true, false])
  })
})
