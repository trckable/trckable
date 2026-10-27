import { describe, expect, it } from 'vitest'
import { beforeName } from './beforeName'

describe('where the name of the period before is written', () => {
  // The dashed line ends at the right edge, at height 100.
  const dashed = [[10, 100], [60, 100], [120, 100]]
  it('above the end of the dashed line when nothing is in the way', () => {
    expect(beforeName(9, dashed, [[10, 150], [60, 150]], 300)).toEqual({ x: 120, y: 93 })
  })
  it('below it when the live line or its dot is above', () => {
    expect(beforeName(9, dashed, [[100, 90], [118, 84]], 300)).toEqual({ x: 120, y: 117 })
  })
  it('nowhere when both sides are taken', () => {
    expect(beforeName(9, dashed, [[100, 90], [100, 112]], 300)).toBeNull()
  })
  it('stays inside the right edge', () => {
    expect(beforeName(9, [[10, 120], [320, 100]], [], 300)?.x).toBe(300)
  })
})
