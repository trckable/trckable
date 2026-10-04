import { beforeEach, describe, expect, it } from 'vitest'
import { setWeekStart } from '../../lib/dates'
import { changeVs, heatCap, heatOf, momentsByDay, monthOf, monthStep, planScore, stepDay, weekdayHeader, type CalDay } from './model'

const day = (d: string, visitors: number, usual = 0): CalDay => ({ day: d, visitors, usual })

describe('a day against its usual', () => {
  it('is a whole percent, for a finished day that has a usual', () => {
    expect(changeVs(day('2026-09-07', 1240, 927), '2026-09-20')).toBe(34)
    expect(changeVs(day('2026-09-01', 705, 870), '2026-09-20')).toBe(-19)
  })
  it('is nothing for today, a day to come, or a site with no usual yet', () => {
    expect(changeVs(day('2026-09-20', 50, 100), '2026-09-20')).toBeNull()
    expect(changeVs(day('2026-09-25', 0, 100), '2026-09-20')).toBeNull()
    expect(changeVs(day('2026-09-02', 50, 0), '2026-09-20')).toBeNull()
  })
  it('scores a planned day the same way, and only a planned one', () => {
    const d = day('2026-09-19', 2480, 860)
    const plan = { id: 'a', day: d.day, text: 'Show HN', created_at: 0, planned: true }
    expect(planScore(d, [plan], '2026-09-30')).toBe(188)
    expect(planScore(d, [{ ...plan, planned: false }], '2026-09-30')).toBeNull()
  })
})

describe('the heat of a month', () => {
  const month = Array.from({ length: 29 }, (_, i) => day(`2026-09-${String(i + 1).padStart(2, '0')}`, 900 + i * 4)).concat(day('2026-09-30', 20000))
  it('is capped near the month’s busy days, so one spike does not flatten the rest', () => {
    const cap = heatCap(month, '2026-10-05')
    expect(cap).toBeLessThan(2000)
    expect(heatOf(20000, cap)).toBe(1)
    expect(heatOf(900, cap)).toBeGreaterThan(0.7)
  })
  it('leaves out today and the days to come, and is zero for a month with no visits', () => {
    expect(heatCap([day('2026-09-20', 500), day('2026-09-21', 0)], '2026-09-20')).toBe(0)
    expect(heatOf(10, 0)).toBe(0)
  })
})

describe('the weekday header', () => {
  beforeEach(() => setWeekStart(1))
  it('starts on the site’s first day and carries each weekday’s average (the server sends Sunday first)', () => {
    const h = weekdayHeader([632, 979, 1124, 1144, 837, 847, 897])
    expect(h.map((w) => w.name)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    expect(h.map((w) => w.avg)).toEqual([979, 1124, 1144, 837, 847, 897, 632])
  })
  it('starts on Sunday when the site does', () => {
    setWeekStart(0)
    expect(weekdayHeader([1, 2, 3, 4, 5, 6, 7])[0]).toEqual({ name: 'Sun', avg: 1 })
  })
})

describe('moments and the keys', () => {
  it('groups moments by day, in the order their icons are drawn', () => {
    const by = momentsByDay([
      { t: '2026-09-07T13:00', kind: 'sale' },
      { t: '2026-09-07T00:00', kind: 'spike' },
      { t: '2026-09-08T00:00', kind: 'ai' },
    ])
    expect(by.get('2026-09-07')?.map((m) => m.kind)).toEqual(['spike', 'sale'])
    expect(by.get('2026-09-08')?.length).toBe(1)
  })
  it('moves a day by the arrows and stays inside the month', () => {
    expect(stepDay('2026-09-07', 'ArrowRight', '2026-09')).toBe('2026-09-08')
    expect(stepDay('2026-09-07', 'ArrowLeft', '2026-09')).toBe('2026-09-06')
    expect(stepDay('2026-09-07', 'ArrowDown', '2026-09')).toBe('2026-09-14')
    expect(stepDay('2026-09-07', 'ArrowUp', '2026-09')).toBe('2026-09-07')
    expect(stepDay('2026-09-30', 'ArrowRight', '2026-09')).toBe('2026-09-30')
    expect(stepDay('2026-09-07', 'Enter', '2026-09')).toBe('2026-09-07')
  })
  it('follows the period’s month until a month is chosen', () => {
    expect(monthOf('1', '2026-09-20')).toBe('2026-09')
    expect(monthOf('2026-07', '2026-09-20')).toBe('2026-07')
    expect(monthOf('2026-07-14', '2026-09-20')).toBe('2026-07')
    expect(monthStep('2026-12', 1)).toBe('2027-01')
    expect(monthStep('2026-01', -1)).toBe('2025-12')
  })
})
