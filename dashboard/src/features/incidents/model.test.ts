import { describe, expect, it } from 'vitest'
import type { Incident } from './api'
import { accountTotals, affectedSeconds, dayIn, dayLasted, dayStates, daysBetween, duration, rowTotals, startOfDay, uptimeOf, uptimePct } from './model'

const at = (iso: string) => Date.parse(iso) / 1000
const inc = (o: Partial<Incident>): Incident => ({ id: 'i', site: 's', kind: 'quiet', started_at: 0, ended_at: null, cause: 'no visits', expected_visits: null, note: '', ...o })

describe('incident words and figures', () => {
  it('writes a span the way people say it', () => {
    expect(duration(20)).toBe('<1m')
    expect(duration(45 * 60)).toBe('45m')
    expect(duration(3 * 3600 + 12 * 60)).toBe('3h 12m')
    expect(duration(3 * 3600)).toBe('3h')
    expect(duration(2 * 86400 + 4 * 3600)).toBe('2d 4h')
  })

  it('finds the day of a moment in the site’s own zone', () => {
    expect(dayIn(at('2026-10-01T23:30:00Z'), 'UTC')).toBe('2026-10-01')
    expect(dayIn(at('2026-10-01T23:30:00Z'), 'Europe/Berlin')).toBe('2026-10-02')
    expect(dayIn(at('2026-10-01T12:00:00Z'), 'Not/AZone')).toBe('2026-10-01')
    expect(startOfDay('2026-10-02', 'Europe/Berlin')).toBe(at('2026-10-01T22:00:00Z'))
  })

  it('colours each day by the worst incident that touched it', () => {
    const days = daysBetween('2026-10-01', '2026-10-05')
    const list = [
      inc({ kind: 'quiet', started_at: at('2026-10-02T20:00:00Z'), ended_at: at('2026-10-03T04:00:00Z') }),
      inc({ kind: 'down', started_at: at('2026-10-03T01:00:00Z'), ended_at: at('2026-10-03T02:00:00Z') }),
      inc({ kind: 'quiet', started_at: at('2026-10-05T10:00:00Z') }),
    ]
    const s = dayStates(list, days, 'UTC', at('2026-10-05T12:00:00Z'))
    expect([...s.values()]).toEqual(['ok', 'quiet', 'down', 'ok', 'quiet'])
  })

  it('counts overlapping incidents once and cuts them to the period', () => {
    const list = [inc({ started_at: 100, ended_at: 400 }), inc({ started_at: 300, ended_at: 500 }), inc({ started_at: 900 })]
    expect(affectedSeconds(list, 200, 1000, 1000)).toBe(300 + 100)
  })

  it('never calls a period with lost time perfect', () => {
    expect(uptimePct(1000, 0)).toBe(100)
    expect(uptimePct(100000, 1)).toBe(99.9)
    expect(uptimePct(86400 * 30, 3600 * 3)).toBe(99.6)
    expect(uptimePct(100, 400)).toBe(0)
  })

  it('totals a row of All sites over its days', () => {
    const now = at('2026-10-10T00:00:00Z')
    const t = rowTotals([inc({ started_at: now - 3600 * 5, ended_at: now - 3600 * 2 }), inc({ started_at: now - 40 * 86400, ended_at: now - 39 * 86400 })], 7, now)
    expect(t).toEqual({ count: 1, seconds: 3 * 3600, pct: 98.2, span: 7 * 86400 })
  })

  it('totals the account, counting the incident of a silent site but not its time, and naming those down now', () => {
    const now = at('2026-10-10T00:00:00Z')
    const list = [
      inc({ site: 'a', kind: 'down', started_at: now - 3600 * 5, ended_at: now - 3600 * 2 }),
      inc({ site: 'b', kind: 'down', started_at: now - 10 * 86400 }),
      inc({ site: 'c', kind: 'down', started_at: now - 600 }),
    ]
    const t = accountTotals([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], list, 7, now)
    expect(t.count).toBe(3)
    expect(t.down).toEqual(['b', 'c'])
    expect(t.count).toBeGreaterThanOrEqual(t.down.length)
    expect(t.pct).toBeCloseTo(100 - ((3 * 3600 + 600) / (3 * 7 * 86400)) * 100, 5)
    expect(accountTotals([{ id: 'z' }], [], 7, now)).toEqual({ count: 0, pct: 100, down: [], watched: true })
    expect(accountTotals([{ id: 'z', watched_since: now + 60 }], [], 7, now).watched).toBe(false)
  })

  it('counts the time one day spent in an incident', () => {
    const x = inc({ started_at: at('2026-10-01T22:00:00Z'), ended_at: at('2026-10-02T01:30:00Z') })
    expect(dayLasted([x], '2026-10-01', 'UTC', at('2026-10-05T00:00:00Z'))).toBe(2 * 3600)
    expect(dayLasted([x], '2026-10-02', 'UTC', at('2026-10-05T00:00:00Z'))).toBe(1.5 * 3600)
  })

  it('leaves the days before watching began unknown, unless an incident says otherwise', () => {
    const days = ['2026-10-01', '2026-10-02', '2026-10-03']
    const x = inc({ kind: 'down', started_at: at('2026-10-01T10:00:00Z'), ended_at: at('2026-10-01T12:00:00Z') })
    const got = dayStates([x], days, 'UTC', at('2026-10-04T00:00:00Z'), at('2026-10-03T08:00:00Z'))
    expect([...got.values()]).toEqual(['down', 'unwatched', 'ok'])
  })

  it('counts only watched time in a row, and says nothing when none was watched', () => {
    const now = at('2026-10-10T00:00:00Z')
    const x = inc({ kind: 'down', started_at: now - 3 * 86400, ended_at: now - 3 * 86400 + 3600 })
    const t = rowTotals([x], 7, now, now - 2 * 86400)
    expect(t).toMatchObject({ count: 0, seconds: 0, span: 2 * 86400 })
    expect(rowTotals([], 7, now, now + 60).span).toBe(0)
    expect(uptimeOf(0, 0)).toBeNull()
    // Paused time is neither up nor down: out of the span, so a fully paused period has no figure and a part of one is not a 100 % it did not earn.
    expect(uptimeOf(86400, 0, undefined, 86400)).toBeNull()
    expect(uptimeOf(86400, 4320, undefined, 43200)).toEqual({ pct: 90, downOnly: false })
    expect(uptimeOf(86400, 0, false)).toEqual({ pct: 100, downOnly: true })
    expect(uptimeOf(86400, 0, true)?.downOnly).toBe(false)
  })
})
