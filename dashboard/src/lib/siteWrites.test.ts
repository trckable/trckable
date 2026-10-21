import { afterEach, describe, expect, it, vi } from 'vitest'
import { call } from './api'
import { areaOf, onSiteWrite } from './siteWrites'

afterEach(() => vi.unstubAllGlobals())
const answer = (ok: boolean) => vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok, status: ok ? 200 : 500, statusText: 'x', json: () => Promise.resolve({}) })))

describe('what a write path names', () => {
  it('knows the modules, Answers and Mentions of a site, and nothing else', () => {
    expect(areaOf('/sites/s1/modules/vitals')).toEqual({ area: 'modules', site: 's1' })
    expect(areaOf('/sites/s1/answers/questions')).toEqual({ area: 'answers', site: 's1' })
    expect(areaOf('/sites/s%201/mentions/keywords')).toEqual({ area: 'mentions', site: 's 1' })
    expect(areaOf('/sites/s1/goals')).toBeNull()
    expect(areaOf('/account')).toBeNull()
  })
})

describe('the one place a write is announced', () => {
  it('tells listeners after a write succeeded, from whichever view made it', async () => {
    answer(true)
    const seen = vi.fn()
    const off = onSiteWrite(seen)
    await call('PUT', '/sites/s1/modules/vitals', { enabled: true })
    expect(seen).toHaveBeenCalledWith('modules', 's1')
    off()
    await call('PUT', '/sites/s1/modules/vitals', { enabled: false })
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('says nothing for a read, a failed write or a write to something else', async () => {
    const seen = vi.fn()
    const off = onSiteWrite(seen)
    answer(true)
    await call('GET', '/sites/s1/modules')
    await call('PATCH', '/sites/s1/goals/g', {})
    answer(false)
    await call('PUT', '/sites/s1/modules/vitals', { enabled: true }).catch(() => undefined)
    off()
    expect(seen).not.toHaveBeenCalled()
  })
})
