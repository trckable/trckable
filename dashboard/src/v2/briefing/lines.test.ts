import { afterEach, describe, expect, it, vi } from 'vitest'
import * as me from '../../lib/me'
import { chartLine } from './lines'

describe('the line over the chart', () => {
  afterEach(() => vi.restoreAllMocks())
  it('says it is learning the normal to the site’s own people, and nothing to a shared link', () => {
    vi.spyOn(me, 'isShared').mockReturnValue(false)
    expect(chartLine(true, false, 2, () => 'x')).toBe('Learning your normal · day 3 of 7')
    vi.spyOn(me, 'isShared').mockReturnValue(true)
    expect(chartLine(true, false, 2, () => 'x')).toBe('')
  })
  it('keeps the note once there is a normal to speak of', () => {
    vi.spyOn(me, 'isShared').mockReturnValue(true)
    expect(chartLine(false, false, 9, () => 'x')).toBe('x')
  })
})
