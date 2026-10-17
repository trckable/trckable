import { describe, expect, it } from 'vitest'
import { allDone, nextHint, QUIET_MS, type Known } from './rules'

const base: Known = { seen: [], off: false, shown: false, age: QUIET_MS, viewer: false, here: { rows: true, peek: true }, covered: false }
const k = (p: Partial<Known>): Known => ({ ...base, ...p })

describe('nextHint', () => {
  it('starts with the rows', () => expect(nextHint(base)).toBe('rows'))
  it('goes in order, each waiting for the one before', () => {
    expect(nextHint(k({ seen: [] }))).toBe('rows')
    expect(nextHint(k({ seen: ['rows'] }))).toBe('peek')
    expect(nextHint(k({ seen: ['rows', 'peek'] }))).toBeNull()
  })
  it('waits for the next one rather than skipping to another', () => expect(nextHint(k({ here: { rows: false, peek: true } }))).toBeNull())
  it('is quiet in the first ten seconds', () => expect(nextHint(k({ age: QUIET_MS - 1 }))).toBeNull())
  it('shows one a visit', () => expect(nextHint(k({ shown: true }))).toBeNull())
  it('stays away once turned off', () => expect(nextHint(k({ off: true }))).toBeNull())
  it('stays away while something is open over the page', () => expect(nextHint(k({ covered: true }))).toBeNull())
  it('gives a viewer the rows hint only', () => {
    expect(nextHint(k({ viewer: true, seen: [] }))).toBe('rows')
    expect(nextHint(k({ viewer: true, seen: ['rows'] }))).toBeNull()
  })
})

describe('allDone', () => {
  it('is done for a viewer after one, for others after two', () => {
    expect(allDone(['rows'], true)).toBe(true)
    expect(allDone(['rows'], false)).toBe(false)
    expect(allDone(['rows', 'peek'], false)).toBe(true)
  })
})
