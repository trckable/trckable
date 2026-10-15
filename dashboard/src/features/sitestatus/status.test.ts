import { describe, expect, it } from 'vitest'
import type { Site } from '../../lib/api'
import { statusOf } from './status'
import { silence, span } from './time'

const NOW = 1_800_000_000_000
const sec = NOW / 1000
const site = (o: Partial<Site> = {}): Site => ({ id: 's1', domain: 'a.example', name: '', timezone: 'UTC', currency: 'USD', proxy_key: '', ...o })

describe('a site the uptime probe finds not answering', () => {
  it('is down even while visits are still coming in', () => {
    expect(statusOf(site({ last_event_at: sec - 60, down_since: sec - 600 }), NOW)).toBe('down')
    expect(statusOf(site({ down_since: sec - 600 }), NOW)).toBe('down')
  })
})

describe('a site’s status', () => {
  it('is new before the first visit, ok while visits are recent', () => {
    expect(statusOf(site(), NOW)).toBe('new')
    expect(statusOf(site({ last_event_at: sec - 3600 }), NOW)).toBe('ok')
  })

  it('is ok under the threshold even when the last look failed (the server’s incident rule has the same cases: server/internal/server/incidents_test.go)', () => {
    expect(statusOf(site({ last_event_at: sec - 5 * 3600, check: { at: sec - 60, error: 'x' } }), NOW)).toBe('ok')
  })

  it('is quiet once the threshold passes and the page answers or was not looked at', () => {
    expect(statusOf(site({ last_event_at: sec - 7 * 3600 }), NOW)).toBe('quiet')
    expect(statusOf(site({ last_event_at: sec - 7 * 3600, check: { at: sec - 60, found: 'none' } }), NOW)).toBe('quiet')
  })

  it('is down only when a look after the last visit found no answer', () => {
    const last = sec - 7 * 3600
    expect(statusOf(site({ last_event_at: last, check: { at: sec - 60, error: 'x' } }), NOW)).toBe('down')
    expect(statusOf(site({ last_event_at: last, check: { at: last - 60, error: 'x' } }), NOW)).toBe('quiet')
  })

  it('says how long in the shortest span', () => {
    expect(span(30)).toBe('1m')
    expect(span(12 * 60)).toBe('12m')
    expect(span(6 * 3600 + 5)).toBe('6h')
    expect(span(3 * 86400)).toBe('3d')
    expect(silence(site({ last_event_at: sec - 7200 }), NOW)).toBe('2h')
    expect(silence(site(), NOW)).toBe('')
  })
})

describe('a quiet site and the next visit', () => {
  it('is quiet from the last visit and the clock alone, and ok again at the next visit', () => {
    const was = site({ last_event_at: sec - 14 * 3600 })
    expect(statusOf(was, NOW)).toBe('quiet')
    expect(statusOf({ ...was, last_event_at: sec - 5 }, NOW)).toBe('ok')
    // Nothing new arrived, only time: a site goes quiet without a new fact.
    const fresh = site({ last_event_at: sec - 60 })
    expect(statusOf(fresh, NOW)).toBe('ok')
    expect(statusOf(fresh, NOW + 7 * 3600_000)).toBe('quiet')
  })
})
