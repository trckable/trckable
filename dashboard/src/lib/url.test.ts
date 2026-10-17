import { describe, expect, it } from 'vitest'
import { oldAddressTarget, readView, writeView } from './url'

describe('the chart metric in the address', () => {
  it('is revenue or pageviews when the address says so, visitors (nothing) otherwise', () => {
    expect(readView(new URLSearchParams('metric=revenue')).metric).toBe('revenue')
    expect(readView(new URLSearchParams('metric=pageviews')).metric).toBe('pageviews')
    for (const m of ['conversion', 'per-visitor', 'bounce', 'session']) expect(readView(new URLSearchParams(`metric=${m}`)).metric).toBe(m)
    expect(readView(new URLSearchParams('')).metric).toBeUndefined()
    expect(readView(new URLSearchParams('metric=whatever')).metric).toBeUndefined()
  })
  it('round-trips beside the rest of the view, and disappears with visitors', () => {
    const q = 'period=7d&f=channel%3ASearch&mode=full&metric=revenue'
    const v = readView(new URLSearchParams(q))
    expect(writeView(v)).toBe('?' + q)
    expect(writeView({ ...v, metric: undefined })).toBe('?period=7d&f=channel%3ASearch&mode=full')
  })
})

describe('addresses the old Data page made', () => {
  const at = (q: string) => oldAddressTarget(readView(new URLSearchParams(q)))
  it('open the Briefing, or Explore for the ones that were its numbers', () => {
    expect(at('v=story')).toMatchObject({ v: undefined, mode: 'core', xp: undefined })
    expect(at('v=explore')).toMatchObject({ v: undefined, xp: 'overview' })
    expect(at('mode=full&period=7d')).toMatchObject({ mode: 'core', xp: 'overview', period: '7d' })
  })
  it('leave any other address alone', () => {
    expect(at('')).toBeNull()
    expect(at('view=briefing&period=7d')).toBeNull()
  })
})
