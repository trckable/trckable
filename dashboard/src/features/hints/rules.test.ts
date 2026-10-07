import { describe, expect, it } from 'vitest'
import { allDone, nextHint, QUIET_MS, type Known } from './rules'

const base: Known = { seen: [], off: false, shown: false, age: QUIET_MS, viewer: false, here: { story: true, rows: true, peek: true }, covered: false }
const k = (p: Partial<Known>): Known => ({ ...base, ...p })

describe('nextHint', () => {
  it('starts with the Story card', () => expect(nextHint(base)).toBe('story'))
  it('goes in order, each waiting for the one before', () => {
    expect(nextHint(k({ seen: ['story'] }))).toBe('rows')
    expect(nextHint(k({ seen: ['story', 'rows'] }))).toBe('peek')
    expect(nextHint(k({ seen: ['story', 'rows', 'peek'] }))).toBeNull()
  })
  it('waits for the next one rather than skipping to another', () => expect(nextHint(k({ here: { story: false, rows: true, peek: true } }))).toBeNull())
  it('is quiet in the first ten seconds', () => expect(nextHint(k({ age: QUIET_MS - 1 }))).toBeNull())
  it('shows one a visit', () => expect(nextHint(k({ shown: true }))).toBeNull())
  it('stays away once turned off', () => expect(nextHint(k({ off: true }))).toBeNull())
  it('stays away while something is open over the page', () => expect(nextHint(k({ covered: true }))).toBeNull())
  it('gives a viewer the first two only', () => {
    expect(nextHint(k({ viewer: true, seen: ['story'] }))).toBe('rows')
    expect(nextHint(k({ viewer: true, seen: ['story', 'rows'] }))).toBeNull()
  })
})

describe('allDone', () => {
  it('is done for a viewer after two, for others after three', () => {
    expect(allDone(['story', 'rows'], true)).toBe(true)
    expect(allDone(['story', 'rows'], false)).toBe(false)
    expect(allDone(['story', 'rows', 'peek'], false)).toBe(true)
  })
})
