import { describe, expect, it } from 'vitest'
import { aiOf, speedOf, uptimeFigure } from './health'
import type { CrawlerReport, WebVitals } from '../../lib/api'
import type { Incident } from '../../features/incidents/api'

const vitals = (o: Partial<WebVitals>): WebVitals => ({ samples: 40, good: 30, ...o })
const crawl = (kinds: Record<string, number>): CrawlerReport => ({ kinds, series: [], pages: [], total: 0, errors: 0, buckets: [] })
const NOW = Date.parse('2026-10-18T12:00:00Z') / 1000
const DAY = 86400

describe('speedOf', () => {
  it('reads the loading time in seconds', () => expect(speedOf(vitals({ lcp_ms: 1830 }))).toBeCloseTo(1.83))
  it('says nothing from a handful of page views', () => expect(speedOf(vitals({ lcp_ms: 1830, lcp_n: 3 }))).toBeNull())
  it('says nothing without a score or a read', () => {
    expect(speedOf(vitals({}))).toBeNull()
    expect(speedOf(null)).toBeNull()
  })
})

describe('aiOf', () => {
  it('counts the robots that answer or train, not search engines', () => expect(aiOf(crawl({ answer: 10, train: 4, index: 99 }))).toEqual({ hits: 14, answers: 10 }))
  it('says nothing when none came', () => {
    expect(aiOf(crawl({ index: 5 }))).toBeNull()
    expect(aiOf(null)).toBeNull()
  })
})

describe('uptimeFigure', () => {
  const since = NOW - 30 * DAY
  it('is nothing for a site never watched', () => expect(uptimeFigure([], '2026-10-18', 'UTC', NOW, 0)).toBeNull())
  it('gives sixteen days and a full share for a quiet record', () => {
    const f = uptimeFigure([], '2026-10-18', 'UTC', NOW, since)
    expect(f?.days).toHaveLength(16)
    expect(f?.pct).toBe(100)
  })
  it('colours the day of an outage and keeps the share under 100', () => {
    const x: Incident = { id: 'a', site: 's', kind: 'down', started_at: NOW - 3600, ended_at: NOW - 1800, cause: '', expected_visits: null, note: '' }
    const f = uptimeFigure([x], '2026-10-18', 'UTC', NOW, since)
    expect(f?.days[15]).toBe('down')
    expect(f?.pct).toBeLessThan(100)
  })
})
