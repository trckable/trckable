import { describe, expect, it } from 'vitest'
import type { Surge } from '../features/signals/surge'
import type { Site } from '../lib/api'
import { longSpan, needsOf } from './allSitesNeeds'

const NOW = 1_000_000 * 1000
const site = (id: string, o: Partial<Site> = {}) => ({ id, domain: id + '.com', name: id, last_event_at: NOW / 1000 - 60, ...o }) as Site
const surge = (o: Partial<Surge> = {}) => ({ id: 's', started: 1, online: 30, usual: 5, times: 6, why: { source_usual: 0, before: 1, minutes: 5 }, ...o })

describe('what needs you on All sites', () => {
  it('puts a site that is down before a quiet one before a busy one', () => {
    const day = 86400
    const sites = [
      site('busy'),
      site('quiet', { last_event_at: NOW / 1000 - 3 * day }),
      site('down', { last_event_at: NOW / 1000 - 2 * day, check: { at: NOW / 1000 - 60, error: 'timeout' } }),
    ]
    const needs = needsOf(sites, new Map([['busy', surge()]]), NOW)
    expect(needs.map((n) => [n.kind, n.site.id])).toEqual([['down', 'down'], ['quiet', 'quiet'], ['surge', 'busy']])
  })
  it('is empty when every site is fine, new, or past its busy moment', () => {
    const sites = [site('a'), site('b', { last_event_at: undefined }), site('c')]
    expect(needsOf(sites, new Map([['c', surge({ ended: 5 })]]), NOW)).toEqual([])
  })
  it('shows three at most', () => {
    const sites = ['a', 'b', 'c', 'd'].map((id) => site(id, { last_event_at: NOW / 1000 - 86400 }))
    expect(needsOf(sites, new Map(), NOW)).toHaveLength(3)
  })
  it('says a silence in whole units', () => {
    expect(longSpan(60)).toBe('1 minute')
    expect(longSpan(7200)).toBe('2 hours')
    expect(longSpan(3 * 86400 + 5)).toBe('3 days')
  })
})
