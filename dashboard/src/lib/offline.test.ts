// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { toast, settle } = vi.hoisted(() => ({ toast: vi.fn<(m: string) => number>(() => 7), settle: vi.fn() }))
vi.mock('../components/toastBus', () => ({ toast, settle }))

let online = true
beforeEach(() => {
  vi.useFakeTimers()
  toast.mockClear()
  settle.mockClear()
  online = true
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online)
})
afterEach(() => vi.useRealTimers())

const go = (on: boolean) => {
  online = on
  window.dispatchEvent(new Event(on ? 'online' : 'offline'))
}

beforeAll(async () => {
  await import('./offline')
})

describe('offline notice', () => {
  it('stays silent for a blip', () => {
    go(false)
    vi.advanceTimersByTime(1500)
    go(true)
    vi.advanceTimersByTime(10_000)
    expect(toast).not.toHaveBeenCalled()
  })

  it('speaks after a real outage and clears when back', () => {
    go(false)
    vi.advanceTimersByTime(5000)
    expect(toast).toHaveBeenCalledTimes(1)
    expect(toast.mock.calls[0][0]).toMatch(/^No internet connection\. Showing data from .+\. Reconnecting…$/)
    go(true)
    expect(settle).toHaveBeenCalledWith(7, '')
  })
})
