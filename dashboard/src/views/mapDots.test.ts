import { describe, expect, it } from 'vitest'
import { dotPaths, inside, unwrap } from './mapDots'

describe('the dotted map', () => {
  it('undoes a jump across the edge of the map', () => {
    expect(unwrap([[990, 10], [5, 10]], 1000)).toEqual([[990, 10], [1005, 10]])
  })
  it('knows what is inside an outline', () => {
    const box: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]]
    expect(inside([5, 5], box)).toBe(true)
    expect(inside([15, 5], box)).toBe(false)
  })
  it('leaves Antarctica out and never draws a dot off the map', () => {
    const paths = dotPaths([['AQ', 'M0,0L10,0L10,10L0,10Z'], ['RU', 'M990,0L5,0L5,20L990,20Z']], 1000, 6)
    expect(paths.map((p) => p[0])).toEqual(['RU'])
    for (const m of paths[0][1].matchAll(/M(-?[\d.]+),/g)) expect(Number(m[1])).toBeLessThan(1000)
  })
})
