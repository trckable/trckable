import { describe, expect, it } from 'vitest'
import { readView, writeView, type ViewState } from '../../lib/url'
import { isOn, periodPatch, stepOf, switchPatch, CHART_PERIODS } from './chartPick'

const through = (v: ViewState, patch: Partial<ViewState>): ViewState => readView(new URLSearchParams(writeView({ ...v, ...patch })))
const start = readView(new URLSearchParams(''))

describe('the period and comparison over the chart', () => {
  it('writes the period into the address, and the header reads it back', () => {
    const v = through(start, periodPatch('90d'))
    expect(v.period).toBe('90d')
    expect(writeView(v)).toContain('90d')
  })
  it('leaves custom dates, the cut and the day behind when a period is picked', () => {
    const custom = through(start, { period: 'custom', from: '2026-10-01', to: '2026-10-05', bucket: 'day', day: '2026-10-02' })
    const v = through(custom, periodPatch('30d'))
    expect([v.period, v.from, v.to, v.bucket, v.day]).toEqual(['30d', undefined, undefined, undefined, undefined])
  })
  it('the switch turns the comparison on against the period before, and off again', () => {
    const off = through(start, switchPatch(false))
    expect(off.compare).toBe('none')
    expect(isOn(off.compare)).toBe(false)
    const on = through(off, switchPatch(true))
    expect(on.compare).toBe('previous')
    expect(isOn(on.compare)).toBe(true)
  })
  it('the picker writes year and back, keeping the period', () => {
    const v = through(through(start, periodPatch('30d')), { compare: 'year' })
    expect([v.period, v.compare]).toEqual(['30d', 'year'])
  })
  it('offers 7d, 30d, 90d and 12m', () => {
    expect([...CHART_PERIODS]).toEqual(['7d', '30d', '90d', '12mo'])
  })
  it('arrows move through the row and wrap', () => {
    expect(stepOf('ArrowRight', 3, 4)).toBe(0)
    expect(stepOf('ArrowLeft', 0, 4)).toBe(3)
    expect(stepOf('Home', 2, 4)).toBe(0)
    expect(stepOf('End', 0, 4)).toBe(3)
    expect(stepOf('x', 0, 4)).toBe(-1)
  })
})
