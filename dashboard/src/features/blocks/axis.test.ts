import { describe, expect, it } from 'vitest'
import { axisLabel } from './format'

const noon = new Date('2026-10-26T12:00:00Z')

describe('axisLabel', () => {
  it('says a day as the dashboard does, and the last one of today as Today', () => {
    expect(axisLabel('2026-10-20T00:00'.slice(0, 10), false, noon)).toBe('Oct 20')
    expect(axisLabel('2026-10-26', true, noon)).toBe('Today')
    expect(axisLabel('2026-10-25', true, noon)).toBe('Oct 25')
  })
  it('says an hourly point as its hour, the last one of today as Now', () => {
    expect(axisLabel('2026-10-26T00:00', false, noon)).toBe('00:00')
    expect(axisLabel('2026-10-26T12:00', true, noon)).toBe('Now')
  })
  it('leaves a name it does not know as it is', () => {
    expect(axisLabel('Week 3', false, noon)).toBe('Week 3')
  })
})
