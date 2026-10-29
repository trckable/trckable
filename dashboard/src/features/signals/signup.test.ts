import { afterEach, describe, expect, it, vi } from 'vitest'
import { fromSignups } from '../../v2/bell/notices'
import { isSignup, signupLine } from './signupLine'
import { noteSignups, onSignups, signupMoments } from './signupMoments'

const visit = { kind: 'goal' as const, ts: 1_700_000_000_000, goal: 'sign-up', visitor: 'v1', channel: 'Paid', referrer: 'www.google.com' }

describe('a signup on the stream', () => {
  it('is a goal event for the signup goal, and nothing else', () => {
    expect(isSignup(visit, 'sign-up')).toBe(true)
    expect(isSignup({ ...visit, goal: 'start-free' }, 'sign-up')).toBe(false)
    expect(isSignup({ ...visit, kind: 'pageview' }, 'sign-up')).toBe(false)
    expect(isSignup(visit, undefined)).toBe(false)
  })
  it('is told as "New signup", the person and where from', () => {
    const line = signupLine(visit)
    expect(line.startsWith('New signup · ')).toBe(true)
    expect(line.endsWith(' · google.com')).toBe(true)
    expect(signupLine({ ...visit, visitor: undefined, referrer: undefined })).toBe('New signup · Paid')
  })
})

describe('the bell notice for a signup', () => {
  afterEach(() => vi.restoreAllMocks())
  it('is one row each with the host that sent the person, for the site it happened on', () => {
    const heard = vi.fn()
    const stop = onSignups(heard)
    noteSignups('a.com', [{ id: 'signup:1', site: 'a.com', ts: 1_700_000_000_000, title: signupLine(visit), source: 'google.com' }])
    noteSignups('a.com', [{ id: 'signup:1', site: 'a.com', ts: 1_700_000_000_000, title: 'again' }])
    stop()
    expect(heard).toHaveBeenCalledTimes(1)
    const rows = fromSignups(signupMoments(), 'a.com')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'signup', site: 'a.com', source: 'google.com', at: 1_700_000_000 })
    expect(rows[0].title).toContain('New signup · ')
    expect(fromSignups(signupMoments(), 'b.com')).toEqual([])
  })
})
