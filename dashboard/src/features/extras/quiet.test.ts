import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetSettled, QUIET_MS, whenQuiet } from './quiet'

describe('whenQuiet', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    forgetSettled()
  })
  afterEach(() => vi.useRealTimers())

  it('waits for the browser to be idle and a moment more, the first time', () => {
    const fn = vi.fn()
    whenQuiet(fn)
    vi.advanceTimersByTime(QUIET_MS - 1)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2)
    expect(fn).toHaveBeenCalledOnce()
  })

  it('goes at the next idle once the page has been quiet before', () => {
    whenQuiet(() => undefined)
    vi.advanceTimersByTime(QUIET_MS + 1)
    const fn = vi.fn()
    whenQuiet(fn)
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledOnce()
  })

  it('can be cancelled, and then never asks', () => {
    const fn = vi.fn()
    const cancel = whenQuiet(fn)
    vi.advanceTimersByTime(500)
    cancel()
    vi.advanceTimersByTime(QUIET_MS * 3)
    expect(fn).not.toHaveBeenCalled()
  })
})
