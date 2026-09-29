import { describe, expect, it } from 'vitest'
import { needsFirstRun } from './gate'

describe('needsFirstRun', () => {
  it('holds an owner with no site', () => expect(needsFirstRun([], true)).toBe(true))
  it('holds an owner whose only site has had no visit', () => expect(needsFirstRun([{ last_event_at: 0 }, {}], true)).toBe(true))
  it('lets an owner through with one verified site, even beside an unverified one', () => {
    expect(needsFirstRun([{ last_event_at: 0 }, { last_event_at: 1700000000 }], true)).toBe(false)
  })
  it('never holds a viewer', () => {
    expect(needsFirstRun([], false)).toBe(false)
    expect(needsFirstRun([{ last_event_at: 0 }], false)).toBe(false)
  })
})
