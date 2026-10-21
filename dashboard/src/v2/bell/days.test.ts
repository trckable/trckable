import { describe, expect, it } from 'vitest'
import { byDay, dayOf, timeOf } from './days'

// 18 Oct 2026, 07:10 UTC is 09:10 in Tirane (UTC+2) and 03:10 in New York (UTC-4).
const at = Date.UTC(2026, 9, 18, 7, 10) / 1000
const row = (id: string, t: number) => ({ id, at: t })

describe('the bell’s days', () => {
  it('shows the clock of the viewer’s zone, not UTC', () => {
    expect(timeOf(at, 'Europe/Tirane')).toBe('09:10')
    expect(timeOf(at, 'America/New_York')).toBe('03:10')
  })

  it('counts a day in the viewer’s zone: 23:30 UTC the day before is already the next day in Tirane', () => {
    const late = Date.UTC(2026, 9, 17, 23, 30) / 1000
    expect(dayOf(late, 'Europe/Tirane')).toBe('2026-10-18')
    expect(dayOf(late, 'UTC')).toBe('2026-10-17')
  })

  it('groups newest-first rows under Today, Yesterday and a dated heading', () => {
    const now = at + 3600
    const days = byDay([row('a', now - 60), row('b', now - 120), row('c', now - 86_400), row('d', now - 3 * 86_400), row('e', now - 3 * 86_400 - 60)], now, 'Europe/Tirane')
    expect(days.map((d) => [d.label, d.rows.map((r) => r.id)])).toEqual([
      ['Today', ['a', 'b']],
      ['Yesterday', ['c']],
      ['Thu 15 Oct', ['d', 'e']],
    ])
  })

  it('has no days for no rows, and yesterday across a month’s end', () => {
    expect(byDay([])).toEqual([])
    const now = Date.UTC(2026, 10, 1, 10) / 1000
    expect(byDay([row('a', now - 86_400)], now, 'UTC')[0].label).toBe('Yesterday')
  })
})
