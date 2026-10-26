import { describe, expect, it } from 'vitest'
import { moments, streak } from './moments'
import { dayBandOf } from './usual'

const days = Array.from({ length: 90 }, (_, i) => new Date(Date.UTC(2026, 6, 19 + i, 12)).toISOString().slice(0, 10))
const flat = (n: number) => days.map(() => n)

describe('moments', () => {
  const base = { days, today: true, week: false, from: 89, to: 89, elapsed: 600, todayUp: false, filtered: false }
  it('says nothing for a quiet, ordinary day', () => {
    expect(moments({ ...base, totals: flat(100) })).toEqual({ pills: [], record: null })
  })
  it('names the record day of the days it shows, for the chart to mark, and not today (drawn by the hour)', () => {
    const totals = flat(100)
    totals[85] = 400
    const week = { ...base, today: false, week: true, from: 80, to: 88 }
    expect(moments({ ...week, totals }).record).toEqual({ day: days[85], people: 400 })
    const now = flat(100)
    now[89] = 400
    expect(moments({ ...base, totals: now }).record).toBeNull()
  })
  it('waits until six in the morning for a record', () => {
    const totals = flat(100)
    totals[89] = 400
    expect(moments({ ...base, totals, elapsed: 120 }).pills).toEqual([])
  })
  it('counts days in a row above the usual band', () => {
    const totals = flat(100)
    for (let i = 85; i < 89; i++) totals[i] = 300
    expect(streak(totals, days, 88)).toBe(4)
    expect(moments({ ...base, totals, todayUp: true }).pills).toContain('5th day in a row above usual')
    expect(moments({ ...base, totals }).pills).toContain('4 days above usual')
  })
  it('says nothing when a filter narrows the numbers', () => {
    const totals = flat(100)
    totals[89] = 900
    expect(moments({ ...base, totals, filtered: true }).pills).toEqual([])
  })
  it('has no band without weeks behind it', () => {
    expect(dayBandOf([1], days.slice(0, 1), 0)).toBeNull()
  })
})
