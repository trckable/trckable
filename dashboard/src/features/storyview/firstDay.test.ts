import { describe, expect, it } from 'vitest'
import type { Result } from '../../lib/api'
import { firstDayOf } from './firstDay'

const r = (days: [string, number][]): Result => ({ approximate: false, kpis: {} as Result['kpis'], series: days.map(([t, visitors]) => ({ t, visitors }) as Result['series'][number]), dims: {}, goals: null })

describe('first day', () => {
  it('is the first day with visitors', () => {
    expect(firstDayOf(r([['2026-10-10', 0], ['2026-10-11', 4], ['2026-10-12', 9]]), undefined)).toBe('2026-10-11')
  })
  it('looks in the earlier period first', () => {
    expect(firstDayOf(r([['2026-10-12', 9]]), r([['2026-10-09', 0], ['2026-10-10', 2]]))).toBe('2026-10-10')
  })
  it('is the day the site was added when the report starts after it', () => {
    expect(firstDayOf(r([['2026-10-14', 9]]), undefined, '2026-10-02')).toBe('2026-10-02')
  })
  it('is unknown without visitors', () => {
    expect(firstDayOf(r([['2026-10-14', 0]]), undefined)).toBeUndefined()
  })
})
