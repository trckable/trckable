import { describe, expect, it } from 'vitest'
import { unwrap } from './PlacesMap'

describe('the map outlines', () => {
  it('leaves a ring that stays on one side of the map as it is', () => {
    expect(unwrap('M10,10L20,10L20,20Z')).toBe('M10,10L20,10L20,20Z')
  })
  it('cuts a ring that crosses the edge of the map into one ring on each side', () => {
    expect(unwrap('M900,10L990,10L5,12L20,12L20,20L990,20L900,20Z')).toBe('M990,20L900,20L900,10L990,10ZM5,12L20,12L20,20Z')
  })
})
