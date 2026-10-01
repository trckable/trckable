import { describe, expect, it } from 'vitest'
import { calendarPrevious, compareLabel, compareRange, presetById, shiftRange } from './dates'

describe('comparing a calendar period', () => {
  it('compares this year to date with last year to date', () => {
    expect(calendarPrevious('ytd', { from: '2026-01-01', to: '2026-09-24' })).toEqual({ from: '2025-01-01', to: '2025-09-24' })
  })
  it('compares this month with the same days of last month, never past its end', () => {
    expect(calendarPrevious('mtd', { from: '2026-03-01', to: '2026-03-31' })).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(calendarPrevious('mtd', { from: '2026-09-01', to: '2026-09-24' })).toEqual({ from: '2026-08-01', to: '2026-08-24' })
  })
  it('compares this week with the same days of last week', () => {
    expect(calendarPrevious('wtd', { from: '2026-09-21', to: '2026-09-24' })).toEqual({ from: '2026-09-14', to: '2026-09-17' })
  })
  it('keeps the period just before for the rolling ones', () => {
    expect(calendarPrevious('30d', { from: '2026-08-26', to: '2026-09-24' })).toBeNull()
    expect(compareRange({ from: '2026-08-26', to: '2026-09-24' }, 'previous', undefined, '30d')).toEqual({ from: '2026-07-27', to: '2026-08-25' })
    expect(compareRange({ from: '2026-01-01', to: '2026-09-24' }, 'previous', undefined, 'ytd')).toEqual({ from: '2025-01-01', to: '2025-09-24' })
  })
})

describe('Yesterday', () => {
  const yesterday = presetById('yesterday')
  it('is the site\'s previous day, also across a month and a year', () => {
    expect(yesterday?.label).toBe('Yesterday')
    expect(yesterday?.range('2026-10-01')).toEqual({ from: '2026-09-30', to: '2026-09-30' })
    expect(yesterday?.range('2027-01-01')).toEqual({ from: '2026-12-31', to: '2026-12-31' })
  })
  it('compares with the day before it', () => {
    const r = { from: '2026-09-30', to: '2026-09-30' }
    expect(compareRange(r, 'previous', undefined, 'yesterday')).toEqual({ from: '2026-09-29', to: '2026-09-29' })
    expect(compareLabel('yesterday', 'previous', r)).toBe('the day before')
  })
  it('shifts a day at a time with the arrows', () => {
    const r = { from: '2026-09-30', to: '2026-09-30' }
    expect(shiftRange(r, -1)).toEqual({ from: '2026-09-29', to: '2026-09-29' })
    expect(shiftRange(r, 1)).toEqual({ from: '2026-10-01', to: '2026-10-01' })
  })
})
