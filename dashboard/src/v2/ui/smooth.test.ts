import { describe, expect, it } from 'vitest'
import { segments, stretch, type Pt } from './smooth'

const ys = (c: string) => c.slice(1).split(' ').map((q) => Number(q.split(',')[1]))

describe('smooth line', () => {
  it('has one curve between each pair of points and ends on each point', () => {
    const p: Pt[] = [[0, 10], [10, 0], [20, 5], [30, 5]]
    const s = segments(p)
    expect(s).toHaveLength(3)
    expect(s[2].endsWith('30,5')).toBe(true)
  })

  it('never overshoots a peak or a flat floor', () => {
    const p: Pt[] = [[0, 100], [10, 100], [20, 20], [30, 100], [40, 100]]
    for (const c of segments(p)) for (const y of ys(c)) expect(y).toBeGreaterThanOrEqual(20)
    for (const y of ys(segments(p)[0])) expect(y).toBe(100)
  })

  it('draws a stretch that starts on its first point', () => {
    const p: Pt[] = [[0, 1], [1, 2], [2, 3]]
    expect(stretch(p, segments(p), 1, 2)).toBe(`M1,2${segments(p)[1]}`)
  })

  it('has nothing to draw for one point', () => expect(segments([[0, 0]])).toEqual([]))
})
