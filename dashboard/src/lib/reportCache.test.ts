import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cachedReport, call, dropReports, peekReport, reportTtl } from './api'
import { prefetchPeriods } from './dashQuery'

const answer = () => new Response(JSON.stringify({ site: 's', current: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } })
const NOW = Date.UTC(2026, 8, 30, 12, 0, 0)

describe('how long a report is kept', () => {
  it('keeps a period that is over for two minutes, one with today in it for ten seconds', () => {
    expect(reportTtl({ to: '2026-09-28' }, NOW)).toBe(120_000)
    expect(reportTtl({ to: '2026-09-30' }, NOW)).toBe(10_000)
    expect(reportTtl({ to: '2026-09-29' }, NOW)).toBe(120_000)
    // At 11:00 UTC a site 12 hours behind it is still on the 29th: that day is not over.
    expect(reportTtl({ to: '2026-09-29' }, Date.UTC(2026, 8, 30, 11, 0, 0))).toBe(10_000)
  })

  it('goes by the comparison when it ends later', () => {
    expect(reportTtl({ to: '2026-09-01', cto: '2026-09-30' }, NOW)).toBe(10_000)
  })
})

describe('the report cache', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockImplementation(() => Promise.resolve(answer()))
    vi.stubGlobal('fetch', fetchMock)
    dropReports()
  })
  afterEach(() => vi.unstubAllGlobals())

  const past = { from: '2020-01-01', to: '2020-01-31' }

  it('asks once for a period that is over, and again only after a write to that site', async () => {
    await cachedReport('a', past)
    await cachedReport('a', past)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await call('PATCH', '/sites/b', { timezone: 'UTC' }) // another site: a's numbers stand
    expect(peekReport('a', past)).toBeDefined()
    await call('PATCH', '/sites/a', { timezone: 'Europe/Berlin' })
    expect(peekReport('a', past)).toBeUndefined()
    await cachedReport('a', past)
    expect(fetchMock).toHaveBeenCalledTimes(4) // the report, both writes, the report again
  })

  it('a write that names no site drops every site’s reports', async () => {
    await cachedReport('a', past)
    await cachedReport('b', past)
    await call('POST', '/payments/start-over', {})
    expect(peekReport('a', past)).toBeUndefined()
    expect(peekReport('b', past)).toBeUndefined()
  })

  it('does not keep or share a read that a write overtook', async () => {
    let release = () => {}
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => (release = () => r(answer()))))
    const slow = cachedReport('a', past)
    await call('PATCH', '/sites/a', { timezone: 'UTC' }) // drops while the read is out
    const again = cachedReport('a', past) // not the read from before the write
    release()
    await slow
    await again
    expect(fetchMock).toHaveBeenCalledTimes(3) // the slow report, the write, a fresh report
    expect(peekReport('a', past)).toBeDefined() // the fresh one is kept, the old one was not
  })

  it('hands back an old report to show while a new one is asked for', async () => {
    await cachedReport('a', past)
    // Past its age, the next read asks again; the old one stays readable meanwhile.
    const p = cachedReport('a', past, 0)
    expect(peekReport('a', past)).toBeDefined()
    await p
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('starts the picker’s first periods with the address’s filters, not the one chosen, not Now', () => {
    vi.stubGlobal('location', { search: '?period=7d&f=channel:Search', pathname: '/x' })
    prefetchPeriods('a', 'UTC', ['now', 'today', '7d', '30d', '90d'])
    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls).toHaveLength(3)
    for (const u of urls) expect(u).toContain('f=channel%3ASearch')
    expect(urls.some((u) => u.includes('bucket=hour'))).toBe(false)
  })
})
