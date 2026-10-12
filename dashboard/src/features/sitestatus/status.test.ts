import { describe, expect, it } from 'vitest'
import type { Site } from '../../lib/api'
import { statusOf } from './status'
import { silence, span } from './time'

const NOW = 1_800_000_000_000
const sec = NOW / 1000
const site = (o: Partial<Site> = {}): Site => ({ id: 's1', domain: 'a.example', name: '', timezone: 'UTC', currency: 'USD', proxy_key: '', ...o })

describe('a site’s status', () => {
  it('is new before the first visit, ok while visits are recent', () => {
    expect(statusOf(site(), NOW)).toBe('new')
    expect(statusOf(site({ last_event_at: sec - 3600 }), NOW)).toBe('ok')
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
