import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { linksApi } from './api'

const answer = () => new Response(JSON.stringify({ links: [], goals: false }), { status: 200, headers: { 'Content-Type': 'application/json' } })

describe('the links read', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockImplementation(() => Promise.resolve(answer()))
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('is one request for the markers and the card asking for the same period', async () => {
    await Promise.all([linksApi.read('s1', '2026-09-01', '2026-09-30'), linksApi.read('s1', '2026-09-01', '2026-09-30')])
    await linksApi.read('s1', '2026-09-01', '2026-09-30') // and a moment later
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await linksApi.read('s1', '2026-09-02', '2026-10-01') // another period is another read
    await linksApi.read('s2', '2026-09-01', '2026-09-30') // so is another site
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('asks again after a failure', async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(new Response('{}', { status: 500 })))
    await expect(linksApi.read('s3', '2026-09-01', '2026-09-30')).rejects.toBeDefined()
    await linksApi.read('s3', '2026-09-01', '2026-09-30')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('lets a caller that leaves stop waiting without cancelling the read the others share', async () => {
    const ctl = new AbortController()
    const left = linksApi.read('s4', '2026-09-01', '2026-09-30', ctl.signal)
    const stays = linksApi.read('s4', '2026-09-01', '2026-09-30')
    ctl.abort()
    await expect(left).rejects.toThrow('aborted')
    await expect(stays).resolves.toEqual({ links: [], goals: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
