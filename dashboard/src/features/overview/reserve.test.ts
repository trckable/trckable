import { describe, expect, it } from 'vitest'
import { expectsScrub } from './reserve'

describe('the scrubber a chart will have', () => {
  it('is there for a period drawn by the day, over more than one day', () => {
    expect(expectsScrub({}, { from: '2026-09-01', to: '2026-09-30' })).toBe(true)
    expect(expectsScrub({}, { from: '2026-09-01', to: '2026-09-02' })).toBe(false) // two days are drawn by the hour
    expect(expectsScrub({ bucket: 'day' }, { from: '2026-09-01', to: '2026-09-02' })).toBe(true)
  })

  it('is not there when the detail is another', () => {
    expect(expectsScrub({ bucket: 'week' }, { from: '2026-09-01', to: '2026-09-30' })).toBe(false)
    expect(expectsScrub({}, { from: '2025-01-01', to: '2026-09-30' })).toBe(false) // a year and more is drawn by the week
  })
})
