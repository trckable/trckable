// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { visibleInterval } from './visibleInterval'

const show = (v: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { value: v, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('visibleInterval', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    show('visible')
  })
  afterEach(() => vi.useRealTimers())

  it('calls on its cadence while the tab is shown', () => {
    const run = vi.fn()
    const stop = visibleInterval(run, 1000)
    vi.advanceTimersByTime(3500)
    expect(run).toHaveBeenCalledTimes(3)
    stop()
  })

  it('makes no calls while hidden, and one at once when shown again', () => {
    const run = vi.fn()
    const stop = visibleInterval(run, 1000)
    show('hidden')
    vi.advanceTimersByTime(60_000)
    expect(run).not.toHaveBeenCalled()
    show('visible')
    expect(run).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(run).toHaveBeenCalledTimes(2)
    stop()
  })

  it('does not call on return when the caller reads then itself', () => {
    const run = vi.fn()
    const stop = visibleInterval(run, 1000, false)
    show('hidden')
    show('visible')
    expect(run).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(run).toHaveBeenCalledTimes(1)
    stop()
  })

  it('starts hidden and waits for the tab to be shown', () => {
    show('hidden')
    const run = vi.fn()
    const stop = visibleInterval(run, 1000)
    vi.advanceTimersByTime(5000)
    expect(run).not.toHaveBeenCalled()
    show('visible')
    expect(run).toHaveBeenCalledTimes(1)
    stop()
  })

  it('stops for good once stopped', () => {
    const run = vi.fn()
    visibleInterval(run, 1000)()
    vi.advanceTimersByTime(5000)
    show('hidden')
    show('visible')
    expect(run).not.toHaveBeenCalled()
  })
})
