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

  describe('a read the page has left', () => {
    /** A report that never answers by itself, and whether the browser was told to stop waiting for it. */
    const hung = () => {
      const stopped: boolean[] = []
      fetchMock.mockImplementation((_url: string, init: RequestInit) => {
        const at = stopped.length
        stopped.push(false)
        return new Promise<Response>((_, fail) =>
          init.signal?.addEventListener('abort', () => {
            stopped[at] = true
            fail(new DOMException('aborted', 'AbortError'))
          }),
        )
      })
      return stopped
    }

    it('is cancelled when its only reader goes', async () => {
      const stopped = hung()
      const ctl = new AbortController()
      const read = cachedReport('a', past, undefined, ctl.signal)
      ctl.abort()
      await expect(read).rejects.toThrow('aborted')
      expect(stopped).toEqual([true])
      // The next ask starts a read of its own, not the cancelled one.
      fetchMock.mockImplementation(() => Promise.resolve(answer()))
      await cachedReport('a', past)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('leaves no listener behind on a signal that outlives the read', async () => {
      fetchMock.mockImplementation(() => Promise.resolve(answer()))
      const ctl = new AbortController()
      const add = vi.spyOn(ctl.signal, 'addEventListener')
      const remove = vi.spyOn(ctl.signal, 'removeEventListener')
      // A page that asks again for the same period every time a visit lands, on one signal.
      for (let i = 0; i < 5; i++) await cachedReport('a', past, 0, ctl.signal)
      await Promise.resolve()
      expect(add).toHaveBeenCalledTimes(5)
      expect(remove).toHaveBeenCalledTimes(5)
    })

    it('goes on while another reader still wants it, and for a reader that cannot cancel', () => {
      const stopped = hung()
      const one = new AbortController()
      const two = new AbortController()
      const first = cachedReport('a', past, undefined, one.signal)
      const second = cachedReport('a', past, undefined, two.signal)
      expect(fetchMock).toHaveBeenCalledTimes(1) // shared
      one.abort()
      expect(stopped).toEqual([false])
      second.catch(() => undefined)
      first.catch(() => undefined)
      void cachedReport('a', past).catch(() => undefined) // a prefetch: nobody can cancel it
      two.abort()
      expect(stopped).toEqual([false])
    })
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
