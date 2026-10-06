import { describe, expect, it } from 'vitest'
import { alertOf, bestDay, countedDays, roughly, verdictOf, type AlertIn, type DayPoint } from './rules'

const days = (xs: number[], partial = false): DayPoint[] =>
  xs.map((v, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, visitors: v, partial: partial && i === xs.length - 1 }))

const base: AlertIn = { bounce: 0.4, visitors: 1000, prevVisitors: 1000, sources: [], now: Date.UTC(2026, 8, 30), includesToday: true }

describe('countedDays', () => {
  it('drops the empty run before tracking and today', () => {
    expect(countedDays(days([0, 0, 5, 6, 7], true)).map((d) => d.visitors)).toEqual([5, 6])
  })
  it('keeps zero days after the first visit', () => {
    expect(countedDays(days([3, 0, 4])).length).toBe(3)
  })
})

describe('bestDay', () => {
  it('skips the partial day', () => {
    expect(bestDay(days([5, 9, 50], true))?.visitors).toBe(9)
  })
  it('is none with no visits', () => {
    expect(bestDay(days([0, 0]))).toBeNull()
  })
})

describe('roughly', () => {
  it('keeps two significant digits', () => {
    expect(roughly(1087)).toBe(1100)
    expect(roughly(42)).toBe(42)
    expect(roughly(15473)).toBe(15000)
  })
})

describe('verdictOf', () => {
  const flat = days(Array.from({ length: 14 }, () => 100))
  it('calls a rise above 5% growing', () => {
    expect(verdictOf({ days: flat, visitors: 1400, prevVisitors: 1300 }).word).toBe('Growing')
  })
  it('calls a fall below -5% slowing down', () => {
    expect(verdictOf({ days: flat, visitors: 1200, prevVisitors: 1300 }).word).toBe('Slowing down')
  })
  it('calls anything between steady', () => {
    expect(verdictOf({ days: flat, visitors: 1320, prevVisitors: 1300 }).word).toBe('Steady')
  })
  it('without a period before: growing when the second half is higher, and says first month', () => {
    const rising = days([10, 10, 10, 10, 30, 30, 30, 30])
    const v = verdictOf({ days: rising, visitors: 160 })
    expect(v.word).toBe('Growing')
    expect(v.explain).toContain('first month')
    expect(verdictOf({ days: days([30, 30, 30, 30, 10, 10, 10, 10]), visitors: 160 }).word).toBe('Getting started')
  })
  it('names a notable best day', () => {
    const v = verdictOf({ days: days([100, 100, 100, 100, 100, 100, 400]), visitors: 1000, prevVisitors: 1000 })
    expect(v.explain).toContain('best day')
  })
  it('states the usual level', () => {
    expect(verdictOf({ days: flat, visitors: 1400, prevVisitors: 1000 }).explain).toContain('~100 a day')
  })
})

describe('alertOf', () => {
  it('shows nothing when no rule fires', () => {
    expect(alertOf(base)).toBeNull()
  })
  it('bounce at 75% or more wins over everything', () => {
    const a = alertOf({ ...base, bounce: 0.78, visitors: 100, prevVisitors: 1000 })
    expect(a?.kind).toBe('bounce')
    expect(a?.tile).toBe('staying')
    expect(a?.headline).toBe('8 in 10 people leave after one page.')
  })
  it('just under the threshold does not fire', () => {
    expect(alertOf({ ...base, bounce: 0.74 })).toBeNull()
  })
  it('visitors down more than 25% opens where they come from', () => {
    const a = alertOf({ ...base, visitors: 700 })
    expect(a?.kind).toBe('down')
    expect(a?.tile).toBe('source')
    expect(alertOf({ ...base, visitors: 760 })).toBeNull()
  })
  it('one source down more than 40% is named', () => {
    const a = alertOf({
      ...base,
      sources: [{ key: 'Search', label: 'Search', visitors: 100 }, { key: 'Social', label: 'Social', visitors: 200 }],
      prevSources: [{ key: 'Search', label: 'Search', visitors: 300 }, { key: 'Social', label: 'Social', visitors: 200 }],
    })
    expect(a?.kind).toBe('source')
    expect(a?.headline).toBe('Search sent far fewer people.')
  })
  it('ignores a source too small to judge', () => {
    expect(alertOf({ ...base, sources: [], prevSources: [{ key: 'X', label: 'X', visitors: 5 }] })).toBeNull()
  })
  it('a quiet tracker, only when the period reaches today', () => {
    const last = base.now - 30 * 3_600_000
    expect(alertOf({ ...base, lastEventAt: last })?.kind).toBe('quiet')
    expect(alertOf({ ...base, lastEventAt: last, includesToday: false })).toBeNull()
    expect(alertOf({ ...base, lastEventAt: base.now - 3_600_000 })).toBeNull()
  })
  it('picks one alert by priority', () => {
    const a = alertOf({ ...base, visitors: 500, lastEventAt: base.now - 48 * 3_600_000 })
    expect(a?.kind).toBe('down')
  })
})
