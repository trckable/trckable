import { describe, expect, it } from 'vitest'
import { draftOf, patchBody } from './logic'
import { periodName } from './periodName'

const today = '2026-11-23'

describe('a link\'s fixed period in words', () => {
  it('names a preset, a range and all time from its first day', () => {
    expect(periodName('12mo', today)).toBe('Last 12 months')
    expect(periodName('2026-03-01..2026-06-14', today)).toBe('Mar 1 – Jun 14')
    expect(periodName('since:2024-02-04', today)).toBe('Since Feb 4, 2024')
  })
  it('is kept as it is when the link is edited', () => {
    const share = { id: 'a', site_id: 's', name: 'n', revenue: false, has_password: false, created_at: 0, views: 0, period: 'since:2024-02-04' } as Parameters<typeof draftOf>[0]
    const was = draftOf(share)
    expect(was.period).toBe('since:2024-02-04')
    expect(patchBody(was, { ...was, name: 'Other' })).toEqual({ name: 'Other' })
  })
})
