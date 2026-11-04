import { beforeEach, describe, expect, it, vi } from 'vitest'

const openExplore = vi.hoisted(() => vi.fn<(tab: string, filters?: unknown[]) => void>())
const setView = vi.hoisted(() => vi.fn())
vi.mock('./open', () => ({ openExplore }))
vi.mock('../../lib/url', () => ({ setView }))

import { filterOf, openThing, periodHolding, targetOf, TODAY_MIN, type Thing } from './thing'

const NOW = new Date('2026-11-04T12:00:00Z')
const at = (daysAgo: number) => NOW.getTime() - daysAgo * 86_400_000

describe('where a thing opens', () => {
  const cases: [Thing, string, { dim: string; value: string }][] = [
    [{ kind: 'source', channel: 'Social', referrer: 'producthunt.com' }, 'overview', { dim: 'referrer', value: 'producthunt.com' }],
    [{ kind: 'source', channel: 'Direct', referrer: '' }, 'overview', { dim: 'channel', value: 'Direct' }],
    [{ kind: 'referrer', value: 'news.ycombinator.com' }, 'overview', { dim: 'referrer', value: 'news.ycombinator.com' }],
    [{ kind: 'channel', value: 'Search' }, 'overview', { dim: 'channel', value: 'Search' }],
    [{ kind: 'campaign', value: 'launch' }, 'overview', { dim: 'campaign', value: 'launch' }],
    [{ kind: 'page', value: '/pricing' }, 'overview', { dim: 'page', value: '/pricing' }],
    [{ kind: 'country', value: 'DE' }, 'overview', { dim: 'country', value: 'DE' }],
    [{ kind: 'device', value: 'mobile' }, 'overview', { dim: 'device', value: 'mobile' }],
    [{ kind: 'browser', value: 'Firefox' }, 'overview', { dim: 'browser', value: 'Firefox' }],
    [{ kind: 'goal', value: 'signup' }, 'funnels', { dim: 'goal', value: 'signup' }],
  ]
  it.each(cases)('%j opens %s narrowed to it', (thing, tab, filter) => {
    expect(targetOf(thing)).toEqual({ tab, filters: [filter] })
    expect(filterOf(thing)).toEqual(filter)
  })

  it('never opens What changed', () => {
    for (const [thing] of cases) expect(targetOf(thing).tab).not.toBe('changed')
  })

  it('lets a caller name another table of the same thing', () => {
    expect(targetOf({ kind: 'page', value: '/' }, 'speed').tab).toBe('speed')
  })
})

describe('the period that holds a visit', () => {
  it('is Today when it was today and Today has enough in it', () => {
    expect(periodHolding(at(0), 'UTC', TODAY_MIN, NOW)).toEqual({ period: 'today' })
  })
  it('is the last 7 days when Today is too small or not known', () => {
    expect(periodHolding(at(0), 'UTC', TODAY_MIN - 1, NOW)).toEqual({ period: '7d' })
    expect(periodHolding(at(0), 'UTC', undefined, NOW)).toEqual({ period: '7d' })
    expect(periodHolding(at(6), 'UTC', 500, NOW)).toEqual({ period: '7d' })
  })
  it('reaches back as far as the visit', () => {
    expect(periodHolding(at(7), 'UTC', 500, NOW)).toEqual({ period: '30d' })
    expect(periodHolding(at(29), 'UTC', 500, NOW)).toEqual({ period: '30d' })
    expect(periodHolding(at(30), 'UTC', 500, NOW)).toEqual({ period: '90d' })
    expect(periodHolding(at(120), 'UTC', 500, NOW)).toEqual({ period: '12mo' })
  })
})

describe('opening a thing', () => {
  beforeEach(() => {
    openExplore.mockClear()
    setView.mockClear()
  })
  it('keeps the period for a plain click', () => {
    openThing({ kind: 'country', value: 'DE' })
    expect(openExplore).toHaveBeenCalledWith('overview', [{ dim: 'country', value: 'DE' }])
    expect(setView).not.toHaveBeenCalled()
  })
  it('sets the period for a click from a visit', () => {
    openThing({ kind: 'source', channel: 'Social', referrer: 'producthunt.com' }, { visit: { at: Date.now(), tz: 'UTC' } })
    expect(openExplore).not.toHaveBeenCalled()
    expect(setView).toHaveBeenCalledWith(expect.objectContaining({ xp: 'overview', xf: [{ dim: 'referrer', value: 'producthunt.com' }], live: false, period: '7d', from: undefined, to: undefined }))
  })
})
