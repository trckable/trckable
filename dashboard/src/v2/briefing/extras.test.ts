import { describe, expect, it } from 'vitest'
import { startOfDay } from '../../features/incidents/model'

describe("today's start is the site's midnight, not UTC's", () => {
  it('a site at UTC-7 starts its day seven hours after UTC midnight', () => {
    expect(startOfDay('2026-10-10', 'America/Los_Angeles')).toBe(Date.parse('2026-10-10T07:00:00Z') / 1000)
    expect(startOfDay('2026-10-10', 'Pacific/Auckland')).toBe(Date.parse('2026-10-09T11:00:00Z') / 1000)
  })
})
