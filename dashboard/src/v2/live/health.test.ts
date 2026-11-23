import { describe, expect, it } from 'vitest'
import { aiOf, speedGrade, speedOf, uptimeFigure } from './health'
import type { CrawlerReport, WebVitals } from '../../lib/api'
import type { Incident } from '../../features/incidents/api'

const vitals = (o: Partial<WebVitals>): WebVitals => ({ samples: 40, good: 30, ...o })
const crawl = (kinds: Record<string, number>): CrawlerReport => ({ kinds, series: [], pages: [], total: 0, errors: 0, buckets: [] })
const NOW = Date.parse('2026-10-18T12:00:00Z') / 1000
const DAY = 86400

describe('speedOf', () => {
  it('reads the loading time in seconds', () => expect(speedOf(vitals({ lcp_ms: 1830 }))).toMatchObject({ kind: 'lcp', sec: 1.83, n: 40 }))
  it('has no figure from a handful of page views, and says how many came', () => {
    expect(speedOf(vitals({ lcp_ms: 1830, lcp_n: 3 }))).toEqual({ kind: 'lcp', sec: null, n: 3, people: 0 })
  })
  it('counts the page views that reported anything while none reported a paint', () => {
    expect(speedOf(vitals({ samples: 2 }))).toMatchObject({ sec: null, n: 2 })
  })
  it('says nothing without a read', () => expect(speedOf(null)).toBeNull())
  it('falls back to the first content shown when too few browsers report the main content', () => {
    expect(speedOf(vitals({ lcp_ms: 2000, lcp_n: 2, fcp_ms: 1400, fcp_n: 60, people: 80 }))).toEqual({ kind: 'fcp', sec: 1.4, n: 60, people: 80 })
  })
  it('keeps the main content when enough browsers report it, never both', () => {
    expect(speedOf(vitals({ lcp_ms: 2000, lcp_n: 5, fcp_ms: 1400, fcp_n: 60 }))).toMatchObject({ kind: 'lcp', sec: 2 })
  })
  it('has no figure when neither has enough readings', () => {
    expect(speedOf(vitals({ lcp_n: 2, fcp_ms: 900, fcp_n: 4, people: 30 }))).toEqual({ kind: 'lcp', sec: null, n: 2, people: 30 })
  })
})

describe('speedGrade', () => {
  it('grades the main content against 2.5 s and 4 s', () => {
    expect([speedGrade('lcp', 2.5), speedGrade('lcp', 3), speedGrade('lcp', 4.1)]).toEqual(['good', 'mid', 'poor'])
  })
  it('grades the first content against 1.8 s and 3 s', () => {
    expect([speedGrade('fcp', 1.8), speedGrade('fcp', 2.5), speedGrade('fcp', 3.1)]).toEqual(['good', 'mid', 'poor'])
  })
})

describe('aiOf', () => {
  it('counts the robots that answer or train, not search engines, and names the assistants that came', () => {
    const r = crawl({ answer: 10, train: 4, index: 99 })
    r.series = [
      { name: 'Anthropic', kind: 'answer', total: 10, values: [] },
      { name: 'OpenAI', kind: 'train', total: 4, values: [] },
      { name: 'Google', kind: 'index', total: 99, values: [] },
    ]
    expect(aiOf(r)).toEqual({ hits: 14, engines: [{ name: 'Anthropic', mark: 'C', hits: 10 }, { name: 'OpenAI', mark: 'O', hits: 4 }] })
  })
  it('says nothing when none came', () => {
    expect(aiOf(crawl({ index: 5 }))).toBeNull()
    expect(aiOf(null)).toBeNull()
  })
})

describe('uptimeFigure', () => {
  const since = NOW - 30 * DAY
  it('is nothing for a site never watched', () => expect(uptimeFigure([], '2026-10-18', 'UTC', NOW, 0)).toBeNull())
  it('gives thirty days and a full share for a quiet record', () => {
    const f = uptimeFigure([], '2026-10-18', 'UTC', NOW, since)
    expect(f?.days).toHaveLength(30)
    expect(f?.pct).toBe(100)
  })
  it('colours the day of an outage and keeps the share under 100', () => {
    const x: Incident = { id: 'a', site: 's', kind: 'down', started_at: NOW - 3600, ended_at: NOW - 1800, cause: '', expected_visits: null, note: '' }
    const f = uptimeFigure([x], '2026-10-18', 'UTC', NOW, since)
    expect(f?.days[29]).toBe('down')
    expect(f?.pct).toBeLessThan(100)
  })
})
