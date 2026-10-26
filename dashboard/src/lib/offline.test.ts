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

/** The server answers (or not) when the page asks it. */
const server = (up: boolean) => vi.stubGlobal('fetch', vi.fn(() => (up ? Promise.resolve({ ok: true }) : Promise.reject(new Error('down')))))

describe('offline notice', () => {
  it('stays silent for a blip', async () => {
    server(true)
    go(false)
    await vi.advanceTimersByTimeAsync(1500)
    go(true)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(toast).not.toHaveBeenCalled()
  })

  it('says nothing when the browser says offline but our server still answers', async () => {
    server(true)
    go(false)
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetch).toHaveBeenCalledWith('/healthz', expect.objectContaining({ cache: 'no-store' }))
    expect(toast).not.toHaveBeenCalled()
    go(true)
  })

  it('speaks when the server does not answer either, with the time unbroken, and clears when back', async () => {
    server(false)
    go(false)
    await vi.advanceTimersByTimeAsync(5000)
    expect(toast).toHaveBeenCalledTimes(1)
    const text = toast.mock.calls[0][0]
    expect(text).toMatch(/^Offline\. Showing data from [^\n]+\.\nReconnecting…$/)
    expect(text.split('\n')[0]).not.toMatch(/\d:\d\d \w/) // no ordinary space inside the time
    go(true)
    expect(settle).toHaveBeenCalledWith(7, '')
  })

  it('goes at once when a later request gets through', async () => {
    server(false)
    go(false)
    await vi.advanceTimersByTimeAsync(5000)
    expect(toast).toHaveBeenCalledTimes(1)
    server(true)
    await vi.advanceTimersByTimeAsync(5000)
    expect(settle).toHaveBeenCalledWith(7, '')
  })
})
