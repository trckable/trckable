import { describe, expect, it } from 'vitest'
import { periodsOf } from './periods'

const today = '2026-11-01'
const day = { from: today, to: today }

describe('periodsOf', () => {
  it('cuts both days at the same hour', () => {
    const p = periodsOf({ period: 'today', compare: 'previous' }, day, today, '20:39')
    expect(p.now).toContain('to 20:39')
    expect(p.was).toContain('31 Oct')
    expect(p.was).toContain('to 20:39')
    expect(p.note).toBeUndefined()
  })
  it('names one period when nothing is compared', () => {
    expect(periodsOf({ period: 'today', compare: 'none' }, day, today, '20:39').was).toBeNull()
  })
  it('warns when last year has its whole day against an unfinished one', () => {
    expect(periodsOf({ period: 'today', compare: 'year' }, day, today, '20:39').note).toBeTruthy()
  })
  it('warns when the two lengths differ', () => {
    const p = periodsOf({ period: 'custom', compare: 'custom', cfrom: '2026-01-01', cto: '2026-01-14' }, { from: '2026-02-01', to: '2026-02-07' }, today, '20:39')
    expect(p.note).toBe('7 days against 14')
  })
})
