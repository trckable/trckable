import { describe, expect, it } from 'vitest'
import { basisOf } from './basis'

const day = { from: '2026-10-16', to: '2026-10-16' }
const week = { from: '2026-10-10', to: '2026-10-16' }

describe('what Explore tells a number against', () => {
  it('uses the usual for a whole site and one day', () => {
    expect(basisOf({ range: day, filters: [], compare: 'previous' })).toBe('usual')
  })
  it('does not use the whole site usual for a narrowed view', () => {
    expect(basisOf({ range: day, filters: [{ dim: 'country', value: 'DE' }], compare: 'previous' })).toBe('previous')
  })
  it('keeps the period before for longer periods', () => {
    expect(basisOf({ range: week, filters: [], compare: 'previous' })).toBe('previous')
  })
  it('keeps what the address asked to compare with', () => {
    expect(basisOf({ range: day, filters: [], compare: 'year' })).toBe('year')
    expect(basisOf({ range: week, filters: [], compare: 'custom' })).toBe('custom')
  })
})
