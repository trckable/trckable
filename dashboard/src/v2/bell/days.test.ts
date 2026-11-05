import { describe, expect, it } from 'vitest'
import { browserZone } from '../../lib/format'
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

  it('writes a site’s time in the site’s zone and lists it under the site’s day, whatever the viewer’s zone', () => {
    const t = Date.UTC(2026, 9, 18, 17, 27) / 1000
    expect(timeOf(t, 'UTC')).toBe('17:27')
    const late = Date.UTC(2026, 9, 17, 23, 30) / 1000
    const now = Date.UTC(2026, 9, 18, 12) / 1000
    const days = byDay([row('a', late)], now, () => 'UTC')
    expect(days[0].label).toBe('Yesterday')
    expect(byDay([row('a', late)], now, () => 'Europe/Tirane')[0].label).toBe('Today')
  })

  it('names the zone once per day group when it is not the viewer’s own, and keeps sites of two zones apart', () => {
    const t = Date.UTC(2026, 9, 18, 10) / 1000
    const zone = (r: { id: string }) => (r.id === 'b' ? 'Pacific/Auckland' : browserZone())
    const days = byDay([row('a', t), row('b', t - 60), row('c', t - 120)], t + 60, zone)
    expect(days.map((d) => [d.zone, d.rows.map((r) => r.id)])).toEqual([
      [undefined, ['a']],
      ['Pacific/Auckland', ['b']],
      [undefined, ['c']],
    ])
  })
})
