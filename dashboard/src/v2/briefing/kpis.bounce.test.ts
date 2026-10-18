import { describe, expect, it } from 'vitest'
import { bounceNote } from './kpis'

describe('the note under "left after one page"', () => {
  it('says "as usual" only when there is a usual to be as', () => {
    expect(bounceNote(0.5, 0.5).t).toBe('as usual')
    expect(bounceNote(0.5, null).t).toBe('')
  })
})
