import { describe, expect, it } from 'vitest'
import { liveShown } from './liveShown'

describe('liveShown', () => {
  it('shows Live when asked for, on a site that has visits', () => {
    expect(liveShown({ wanted: true, shared: false, waiting: false })).toBe(true)
  })
  it('puts the install screen before Live on a site waiting for its first visit', () => {
    expect(liveShown({ wanted: true, shared: false, waiting: true })).toBe(false)
  })
  it('shows Live once the first visit arrives, since the address kept the choice', () => {
    const wanted = true
    expect(liveShown({ wanted, shared: false, waiting: true })).toBe(false)
    expect(liveShown({ wanted, shared: false, waiting: false })).toBe(true)
  })
  it('stays Data when Data was chosen, and on a shared link', () => {
    expect(liveShown({ wanted: false, shared: false, waiting: false })).toBe(false)
    expect(liveShown({ wanted: true, shared: true, waiting: false })).toBe(false)
  })
})
