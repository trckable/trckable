import { describe, expect, it } from 'vitest'
import { crosses, place, touches, type Box } from './labelLayout'

const box = (l: number, t: number, w = 60, h = 20): Box => ({ l, t, r: l + w, b: t + h })
const bounds = box(0, 0, 600, 300)
const flat = [
  [0, 280],
  [600, 280],
]

describe('label layout', () => {
  it('leaves a label where it is when nothing is in the way', () => {
    expect(place([{ box: box(100, 100) }], [], flat, bounds)).toEqual([[0, 0]])
  })
  it('lifts a label off the line, never over it', () => {
    const peak = [
      [0, 280],
      [300, 90],
      [600, 280],
    ]
    const [spot] = place([{ box: box(280, 100) }], [], peak, bounds)
    const [dx, dy] = spot ?? [Infinity, Infinity]
    expect(spot).not.toBeNull()
    expect(crosses(box(280 + dx, 100 + dy), peak)).toBe(false)
  })
  it('keeps two labels apart, the more important one where it is', () => {
    const spots = place([{ box: box(100, 100) }, { box: box(110, 100) }], [], flat, bounds)
    expect(spots[0]).toEqual([0, 0])
    expect(spots[1]).not.toEqual([0, 0])
    const second = spots[1] ?? [0, 0]
    expect(touches(box(100, 100), box(110 + second[0], 100 + second[1]), 0)).toBe(false)
  })
  it('works around a fixed marker', () => {
    const [spot] = place([{ box: box(100, 100) }], [box(90, 95, 80, 30)], flat, bounds)
    expect(spot).not.toEqual([0, 0])
  })
  it('puts a label away when there is no slot, and never leaves the chart', () => {
    const wall = box(0, 0, 600, 300)
    expect(place([{ box: box(100, 100) }], [wall], flat, bounds)).toEqual([null])
    const edge = place([{ box: box(560, 100) }], [], flat, bounds)[0] ?? [Infinity, 0]
    expect(560 + edge[0] + 60).toBeLessThanOrEqual(600)
  })
})
