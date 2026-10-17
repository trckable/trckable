import { describe, expect, it } from 'vitest'
import { ROLL_MS, rollOf } from './roll'

describe('rollOf', () => {
  it('rolls and pulses when the value changes', () => expect(rollOf(2, 3, false)).toEqual({ ms: ROLL_MS, pulse: true }))
  it('does nothing when the value stays', () => expect(rollOf(3, 3, false)).toEqual({ ms: 0, pulse: false }))
  it('only swaps under reduced motion', () => expect(rollOf(2, 3, true)).toEqual({ ms: 0, pulse: false }))
})
