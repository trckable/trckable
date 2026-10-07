import { describe, expect, it } from 'vitest'
import { engagedOf, goalFunnel, goalKind, goalStatus } from './goalModel'

describe('goalKind', () => {
  it('knows the goals the tracker counts by itself', () => {
    expect(goalKind('outbound_click')).toBe('outbound')
    expect(goalKind('file_download')).toBe('download')
    expect(goalKind('form_submit')).toBe('form')
  })
  it('treats every other name as one the person typed', () => {
    expect(goalKind('signup')).toBe('custom')
    expect(goalKind('Outbound click')).toBe('custom')
  })
})

describe('goalStatus', () => {
  it('is converting from half a percent of visitors', () => {
    expect(goalStatus(0.007)).toBe('converting')
    expect(goalStatus(0.005)).toBe('converting')
  })
  it('is barely used below that, and at nothing', () => {
    expect(goalStatus(0.0049)).toBe('barely')
    expect(goalStatus(0)).toBe('barely')
  })
})

describe('engagedOf', () => {
  it('is the visitors who did not bounce', () => {
    expect(engagedOf(1000, 0.42)).toBe(580)
  })
  it('is null without a bounce rate or visitors', () => {
    expect(engagedOf(1000, undefined)).toBeNull()
    expect(engagedOf(0, 0.4)).toBeNull()
  })
})

describe('goalFunnel', () => {
  it('draws three steps against the visitors', () => {
    expect(goalFunnel(1000, 580, 116)?.map((s) => [s.key, s.value, s.width])).toEqual([
      ['visitors', 1000, 100],
      ['engaged', 580, 58],
      ['goal', 116, 12],
    ])
  })
  it('is skipped without engaged data, or when the numbers do not nest', () => {
    expect(goalFunnel(1000, null, 5)).toBeNull()
    expect(goalFunnel(1000, 0, 0)).toBeNull()
    expect(goalFunnel(1000, 300, 400)).toBeNull()
    expect(goalFunnel(1000, 1200, 5)).toBeNull()
  })
})
