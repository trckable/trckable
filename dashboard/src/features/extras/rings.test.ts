import { describe, expect, it } from 'vitest'
import type { ChartMarker } from './extrasApi'
import { markerBucket, ringsAt, ringWhy } from './rings'

const usd = (n: number) => `$${n / 100}`

describe('rings on the chart', () => {
  it('asks for hours on an hourly chart and days on every other', () => {
    expect([markerBucket('hour'), markerBucket('day'), markerBucket('week'), markerBucket('month')]).toEqual(['hour', 'day', 'day', 'day'])
  })

  it('puts a marker on the bucket that starts at it', () => {
    const labels = ['2026-09-01T00:00', '2026-09-02T00:00', '2026-09-03T00:00']
    const m: ChartMarker = { t: '2026-09-02T00:00', kind: 'spike', factor: 4 }
    expect(ringsAt([m], labels)).toEqual([{ i: 1, m }])
  })

  it('puts a day on the week or month that holds it, and drops one before the chart starts', () => {
    const weeks = ['2026-09-07T00:00', '2026-09-14T00:00', '2026-09-21T00:00']
    const inWeek: ChartMarker = { t: '2026-09-16T00:00', kind: 'sale', factor: 3 }
    const before: ChartMarker = { t: '2026-09-02T00:00', kind: 'sale', factor: 3 }
    expect(ringsAt([inWeek, before], weeks)).toEqual([{ i: 1, m: inWeek }])
  })

  it('says why in one line: what, who sent it, what they bought', () => {
    expect(ringWhy({ t: 'x', kind: 'spike', factor: 4.15, referrer: 'news.example' }, usd)).toBe('Spike · 4.2× the usual · mostly from news.example')
    expect(ringWhy({ t: 'x', kind: 'spike', factor: 3, count: 2, amount: 9800 }, usd)).toBe('Spike · 3.0× the usual · 2 sales · $98')
    expect(ringWhy({ t: 'x', kind: 'sale', factor: 4.5, count: 9, amount: 45000, channel: 'AI' }, usd)).toBe('Sales burst · 4.5× the usual · 9 sales · $450 · mostly AI assistants')
  })
})
