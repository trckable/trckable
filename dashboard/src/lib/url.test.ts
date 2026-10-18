import { afterEach, describe, expect, it } from 'vitest'
import { oldAddressTarget, readView, setDefaultPeriodFor, writeView } from './url'

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

describe('the period of an address without one', () => {
  afterEach(() => setDefaultPeriodFor({}))
  it('is Today in a site\'s first week, 30 days after, and an explicit period always wins', () => {
    const now = 1_800_000_000
    setDefaultPeriodFor({ created_at: now - 86400 }, now)
    expect(readView(new URLSearchParams('')).period).toBe('today')
    expect(writeView(readView(new URLSearchParams('')))).toBe('')
    expect(readView(new URLSearchParams('period=30d')).period).toBe('30d')
    expect(writeView(readView(new URLSearchParams('period=30d')))).toBe('?period=30d')
    setDefaultPeriodFor({ created_at: now - 9 * 86400 }, now)
    expect(readView(new URLSearchParams('')).period).toBe('30d')
  })
})

describe('days and ranges in the address', () => {
  const v = (q: string) => readView(new URLSearchParams(q))
  it('drop a range with an end that is no calendar day', () => {
    expect(v('from=2026-13-45&to=abc')).toMatchObject({ period: '30d', from: undefined, to: undefined })
    expect(v('from=2026-02-30&to=2026-03-01').from).toBeUndefined()
    expect(v('from=2026-10-01').period).toBe('30d')
  })
  it('read a range written backwards the right way round', () => {
    expect(v('from=2026-10-10&to=2026-01-01')).toMatchObject({ period: 'custom', from: '2026-01-01', to: '2026-10-10' })
  })
  it('drop a comparison range that is not days, and a scrubbed day that is none', () => {
    expect(v('from=2026-10-01&to=2026-10-05&compare=custom&cfrom=zz&cto=yy')).toMatchObject({ cfrom: undefined, cto: undefined })
    expect(v('day=garbage').day).toBeUndefined()
    expect(v('day=2026-10-04').day).toBe('2026-10-04')
  })
})
