import { describe, expect, it } from 'vitest'
import type { InstallCheck } from '../../lib/api'
import { stageOf, staleDays, whyOf } from './journey'

const check = (o: Partial<InstallCheck>): InstallCheck => ({ url: 'https://a.example/', scripts: 1, ...o })

describe('the way to the first visit', () => {
  it('waits until the server has looked', () => {
    expect(stageOf({ phase: 'idle' }, false)).toBe('waiting')
    expect(stageOf({ phase: 'checking' }, false)).toBe('waiting')
    expect(stageOf({ phase: 'limited' }, false)).toBe('limited')
  })
  it('says what the server found, and nothing it did not', () => {
    const done = (o: Partial<InstallCheck>) => stageOf({ phase: 'done', result: check(o) }, false)
    expect(done({ error: 'no answer' })).toBe('unreachable')
    expect(done({ found: 'none' })).toBe('notfound')
    expect(done({ found: 'other' })).toBe('wrongid')
    expect(done({ found: 'nosite' })).toBe('wrongid')
    expect(done({ found: 'site' })).toBe('found')
    expect(done({ found: 'site', script: 'https://x/js.js', script_status: 404 })).toBe('blocked')
    expect(done({ found: 'site', script: 'https://x/js.js', script_status: 200 })).toBe('found')
  })
  it('keeps the last look while the next runs', () => {
    expect(stageOf({ phase: 'checking', last: check({ found: 'none' }) }, false)).toBe('notfound')
  })
  it('ends at the first visit, whatever was found', () => {
    expect(stageOf({ phase: 'done', result: check({ found: 'none' }) }, true)).toBe('arrived')
  })
  it('is stale after three days', () => {
    const now = 1_000_000 * 1000
    expect(staleDays({ created_at: 1_000_000 - 2 * 86400 }, now)).toBe(0)
    expect(staleDays({ created_at: 1_000_000 - 5 * 86400 }, now)).toBe(5)
    expect(staleDays({}, now)).toBe(0)
  })
  it('lists causes only where there are some to look at', () => {
    expect(whyOf('waiting')).toBeNull()
    expect(whyOf('notfound')).toBe('missing')
    expect(whyOf('found')).toBe('quiet')
    expect(whyOf('arrived')).toBeNull()
  })
})
