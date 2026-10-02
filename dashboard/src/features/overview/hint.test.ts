import { describe, expect, it } from 'vitest'
import { daysInMonth, monthPace, projectionChip, runDays, usualChip, type Usual } from './hint'

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

describe('the end of the month', () => {
  it('spreads the days gone over the month', () => {
    expect(monthPace(10_000, 10, 31)).toBe(31_000)
    expect(monthPace(10_000, 15.5, 31)).toBe(20_000)
  })
  it('needs three days, and some visitors', () => {
    expect(monthPace(10_000, 2.9, 31)).toBeNull()
    expect(monthPace(10_000, 3, 31)).toBe(103_333)
    expect(monthPace(0, 10, 31)).toBeNull()
  })
  it('knows the length of a month and how long it has run', () => {
    expect(daysInMonth('2026-10-02')).toBe(31)
    expect(daysInMonth('2026-02-10')).toBe(28)
    expect(daysInMonth('2028-02-10')).toBe(29)
    expect(runDays('2026-10-11T12')).toBeCloseTo(10.5208, 3)
    // A site that began on the 8th has run from the 8th.
    expect(runDays('2026-10-11T12', '2026-10-08')).toBeCloseTo(3.5208, 3)
    // A first day from another month changes nothing.
    expect(runDays('2026-10-11T12', '2026-09-20')).toBeCloseTo(10.5208, 3)
  })
  it('reads "≈ 41k by 31 Oct"', () => {
    const c = projectionChip(13_000, '2026-10-10T12')
    expect(c?.text).toBe('≈ 42.3K by 31 Oct')
    expect(c?.title).toMatch(/^At this pace: about [\d,]+ visitors by 31 Oct\./)
    expect(projectionChip(13_000, '2026-10-02T12')).toBeNull() // not three days yet
    expect(projectionChip(13_000, '2026-10-03T12', '2026-10-03')).toBeNull() // a site that began today
  })
  it('writes thousands compactly once they pass ten thousand, and in full under it', () => {
    expect(projectionChip(900, '2026-10-10T12')?.text).toBe('≈ 2,930 by 31 Oct')
    expect(projectionChip(30_000, '2026-10-10T12')?.text).toBe('≈ 97.7K by 31 Oct')
  })
})
