import { describe, expect, it } from 'vitest'
import { usualChip, type Usual } from './hint'

const usual = (visitors: number, ...weeks: number[]): Usual => ({
  visitors,
  average: weeks.length ? weeks.reduce((a, b) => a + b, 0) / weeks.length : 0,
  weeks: weeks.map((n, i) => ({ day: `2026-09-${String(24 - i * 7).padStart(2, '0')}`, visitors: n })),
})

describe('vs usual', () => {
  it('is today against the average of the same weekday, in percent', () => {
    const c = usualChip(usual(118, 100, 100, 100, 100), '2026-10-01', false)
    expect(c?.text).toBe('+18% vs usual')
    expect(c?.tone).toBe('up')
    expect(usualChip(usual(80, 100, 100, 100, 100), '2026-10-01', false)).toMatchObject({ text: '−20% vs usual', tone: 'down' })
  })
  it('names the weeks in its tooltip', () => {
    const c = usualChip(usual(110, 100, 90, 110, 100), '2026-10-01', false)
    expect(c?.title).toBe('Against the average of the last 4 Thursdays (Sep 24, Sep 17, Sep 10, Sep 3)')
    expect(usualChip(usual(110, 100), '2026-10-01', false)?.title).toContain('the last Thursday (Sep 24)')
    expect(usualChip(usual(110, 100, 100), '2026-10-01', true)?.title).toContain('up to the same time of day')
  })
  it('calls a small difference about usual', () => {
    expect(usualChip(usual(103, 100, 100), '2026-10-01', false)?.tone).toBe('flat')
  })
  it('says nothing without weeks to compare, or with too few visitors to mean anything', () => {
    expect(usualChip(usual(40), '2026-10-01', false)).toBeNull()
    expect(usualChip(usual(4, 2, 3, 2, 3), '2026-10-01', false)).toBeNull()
    expect(usualChip(usual(0, 0, 0), '2026-10-01', false)).toBeNull()
  })
})
