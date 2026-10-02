import { describe, expect, it } from 'vitest'
import { chartBucket, patchFor } from './apply'
import type { Pin } from './pins'

const range = { from: '2026-09-03', to: '2026-10-02' }
const at = (over = {}) => ({ filters: [], range, today: '2026-10-02', bucket: 'day' as const, ...over })
const spike: Pin = { id: 's', kind: 'spike', score: 90, day: '2026-09-19', filters: [{ dim: 'referrer', value: 'news.example' }], showDay: true, n: {} }

describe('what a click on a pin does to the address', () => {
  it('picks the day and filters to the source, for a spike', () => {
    expect(patchFor(spike, at())).toEqual({ day: '2026-09-19', filters: [{ dim: 'referrer', value: 'news.example' }] })
  })

  it('replaces a filter of the same kind, and keeps the others', () => {
    const had = [{ dim: 'referrer', value: 'old.example' }, { dim: 'country', value: 'DE' }]
    expect(patchFor(spike, at({ filters: had })).filters).toEqual([{ dim: 'country', value: 'DE' }, { dim: 'referrer', value: 'news.example' }])
  })

  it('a finding without a day only filters, and clears a picked day', () => {
    const drop: Pin = { id: 'd', kind: 'drop', score: 90, day: '2026-09-12', filters: [{ dim: 'entry_page', value: '/pricing' }], showDay: false, n: {} }
    expect(patchFor(drop, at())).toEqual({ filters: [{ dim: 'entry_page', value: '/pricing' }], day: undefined })
  })

  it('by the hour the day is already on the chart: only the filter, never a day that would redraw it by day', () => {
    expect(patchFor(spike, at({ bucket: 'hour' }))).toEqual({ filters: [{ dim: 'referrer', value: 'news.example' }], day: undefined })
  })

  it('a finding whose day the period does not reach opens a month around it, and picks no day', () => {
    const referrer: Pin = { id: 'r', kind: 'referrer', score: 60, day: '2026-09-27', filters: [{ dim: 'referrer', value: 'google.com' }], showDay: false, n: {} }
    const today = at({ range: { from: '2026-10-02', to: '2026-10-02' }, bucket: 'hour' })
    expect(patchFor(referrer, today)).toEqual({ period: 'custom', from: '2026-09-03', to: '2026-10-02', bucket: undefined, day: undefined, live: false, filters: [{ dim: 'referrer', value: 'google.com' }] })
    // Inside the period it is the filter alone.
    expect(patchFor(referrer, at())).toEqual({ filters: [{ dim: 'referrer', value: 'google.com' }], day: undefined })
  })

  it('a moment of a day the hourly chart does not reach opens that day by day too', () => {
    const patch = patchFor(spike, at({ range: { from: '2026-10-02', to: '2026-10-02' }, bucket: 'hour' }))
    expect(patch).toMatchObject({ period: 'custom', day: '2026-09-19', live: false })
  })

  it('a day the chart does not draw by day opens a month around it, as a note does', () => {
    const patch = patchFor(spike, at({ bucket: 'week' }))
    expect(patch).toMatchObject({ period: 'custom', day: '2026-09-19', live: false })
  })
})

describe('the bucket the chart is drawn in', () => {
  it('is the one picked, else by the hour for a short span, then the server\'s own steps', () => {
    expect(chartBucket({ bucket: 'week' }, range)).toBe('week')
    expect(chartBucket({}, { from: '2026-10-01', to: '2026-10-02' })).toBe('hour')
    expect(chartBucket({}, range)).toBe('day')
    expect(chartBucket({}, { from: '2026-01-01', to: '2026-10-02' })).toBe('week')
    expect(chartBucket({}, { from: '2023-01-01', to: '2026-10-02' })).toBe('month')
  })
})
