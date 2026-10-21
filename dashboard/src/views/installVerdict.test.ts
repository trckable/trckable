import { describe, expect, it } from 'vitest'
import { problemTone, verdictOf } from './installVerdict'

describe('the Verify verdict', () => {
  it('is working when visits arrive, whatever the homepage read said', () => {
    expect(verdictOf({ checking: false, snippetOk: false, seen: true, fresh: true })).toBe('working')
    expect(verdictOf({ checking: false, snippetOk: true, seen: true, fresh: true })).toBe('working')
  })
  it('is quiet when the last visit is old but the snippet is there, missing when it is not', () => {
    expect(verdictOf({ checking: false, snippetOk: true, seen: true, fresh: false })).toBe('quiet')
    expect(verdictOf({ checking: false, snippetOk: false, seen: true, fresh: false })).toBe('missing')
  })
  it('is missing only with no visit and no snippet', () => {
    expect(verdictOf({ checking: false, snippetOk: false, seen: false, fresh: false })).toBe('missing')
    expect(verdictOf({ checking: false, snippetOk: true, seen: false, fresh: false })).toBe('quiet')
  })
  it('keeps the homepage problem a note while visits are counted', () => {
    expect(problemTone(true)).toBe('info')
    expect(problemTone(false)).toBe('fail')
  })
})
