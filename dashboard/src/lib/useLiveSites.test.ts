import { describe, expect, it } from 'vitest'
import type { Site } from './api'
import { changed } from './useLiveSites'

const site = (o: Partial<Site> = {}): Site => ({ id: 's1', domain: 'a.example', name: '', timezone: 'UTC', currency: 'USD', proxy_key: '', ...o })

describe('a read of the sites list', () => {
  it('is new when a visit moved the last-seen time or the down flag changed', () => {
    expect(changed([site({ last_event_at: 100 })], [site({ last_event_at: 160 })])).toBe(true)
    expect(changed([site()], [site({ down_since: 5 })])).toBe(true)
  })
  it('is not new when nothing differs, so the page keeps its objects', () => {
    expect(changed([site({ last_event_at: 100 })], [site({ last_event_at: 100 })])).toBe(false)
  })
})
