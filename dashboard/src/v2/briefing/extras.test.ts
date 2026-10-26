import { describe, expect, it } from 'vitest'
import { startOfDay } from '../../features/incidents/model'
import { usualSpeed } from './useExtras'

describe('what the speed of a period is told against', () => {
  it('a day against the 28 days before it, a stretch against as many days before it', () => {
    expect(usualSpeed({ from: '2026-10-10', to: '2026-10-10' }, 1)).toEqual(['2026-09-12', '2026-10-09'])
    expect(usualSpeed({ from: '2026-09-01', to: '2026-09-30' }, 30)).toEqual(['2026-08-02', '2026-08-31'])
  })
})

describe("today's start is the site's midnight, not UTC's", () => {
  it('a site at UTC-7 starts its day seven hours after UTC midnight', () => {
    expect(startOfDay('2026-10-10', 'America/Los_Angeles')).toBe(Date.parse('2026-10-10T07:00:00Z') / 1000)
    expect(startOfDay('2026-10-10', 'Pacific/Auckland')).toBe(Date.parse('2026-10-09T11:00:00Z') / 1000)
  })
})
