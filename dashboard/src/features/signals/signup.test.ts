import { describe, expect, it } from 'vitest'
import { isSignup, signupLine } from './signupLine'

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
