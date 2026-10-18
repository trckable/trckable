import { describe, expect, it } from 'vitest'
import { isQuestion } from './Palette'

describe('what the search box sends to Peek', () => {
  it('reads a question mark or a question word with something after it', () => {
    expect(isQuestion('why did traffic drop?')).toBe(true)
    expect(isQuestion('Which pages are slow')).toBe(true)
    expect(isQuestion('traffic today?')).toBe(true)
  })
  it('leaves a jump alone', () => {
    expect(isQuestion('pages')).toBe(false)
    expect(isQuestion('how')).toBe(false)
    expect(isQuestion('issues')).toBe(false)
  })
})
