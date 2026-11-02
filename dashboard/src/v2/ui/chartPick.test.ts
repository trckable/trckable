import { describe, expect, it } from 'vitest'
import { readView, writeView, type ViewState } from '../../lib/url'
import { periodPatch } from './chartPick'

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
})
