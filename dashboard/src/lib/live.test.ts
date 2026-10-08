import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { debounce, onlineNow, watchdog } from './live'
import { connect, type LiveHandlers } from './liveStream'

// The tests run without a browser: a stand-in EventSource the test drives,
// and a document and window that are bare EventTargets.
class FakeSource extends EventTarget {
  static CLOSED = 2
  static OPEN = 1
  static all: FakeSource[] = []
  readyState = 0
  onerror: (() => void) | null = null
  constructor(readonly url: string) {
    super()
    FakeSource.all.push(this)
  }
  send(type: string, data: unknown) {
    this.readyState = FakeSource.OPEN
    this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) }))
  }
  fail(closed = false) {
    this.readyState = closed ? FakeSource.CLOSED : 0
    this.onerror?.()
  }
  close() {
    this.readyState = FakeSource.CLOSED
  }
}
const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' })
const g = globalThis as Record<string, unknown>
g.EventSource = FakeSource
g.document = doc
g.window ??= new EventTarget()

const handlers = () => {
  const on = { online: vi.fn(), visit: vi.fn(), sale: vi.fn(), up: vi.fn(), refetch: vi.fn() }
  return on as typeof on & LiveHandlers
}
const last = () => FakeSource.all[FakeSource.all.length - 1]

beforeEach(() => {
  vi.useFakeTimers()
  FakeSource.all = []
})
afterEach(() => vi.useRealTimers())

describe('watchdog', () => {
  it('fires only after silence', () => {
    const stale = vi.fn()
    const dog = watchdog(25_000, stale)
    dog.kick()
    vi.advanceTimersByTime(20_000)
    dog.kick()
    vi.advanceTimersByTime(20_000)
    expect(stale).not.toHaveBeenCalled()
    vi.advanceTimersByTime(5_000)
    expect(stale).toHaveBeenCalledOnce()
    dog.stop()
  })
})

describe('debounce', () => {
  it('waits for a burst to settle', () => {
    const fn = vi.fn()
    const d = debounce(fn, 1000, 5000)
    d.call()
    vi.advanceTimersByTime(900)
    d.call()
    vi.advanceTimersByTime(900)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledOnce()
  })

  it('runs at least every max while calls go on', () => {
    const fn = vi.fn()
    const d = debounce(fn, 1000, 5000)
    for (let i = 0; i < 12; i++) {
      d.call()
      vi.advanceTimersByTime(500)
    }
    expect(fn).toHaveBeenCalledOnce()
    d.cancel()
  })
})

describe('live stream', () => {
  it('shows the server count only: a visit never moves it, the next count does', () => {
    const on = handlers()
    const stop = connect('s1', on)
    last().send('online', { online: 1 })
    expect(on.online).toHaveBeenLastCalledWith(1)
    expect(on.up).toHaveBeenLastCalledWith(true)
    last().send('visit', { kind: 'pageview', ts: 0, visitor: 'x' })
    // 'x' may already be among the 1 online: no guess until the server counts
    expect(on.online).toHaveBeenCalledTimes(1)
    expect(on.online).toHaveBeenLastCalledWith(1)
    last().send('online', { online: 1 })
    expect(on.online).toHaveBeenCalledTimes(2)
    expect(on.online).toHaveBeenLastCalledWith(1)
    expect(on.visit).toHaveBeenCalledOnce()
    expect(on.refetch).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(on.refetch).toHaveBeenCalledOnce()
    stop()
  })

  it('falls back to polling when the stream goes silent, and stops once it speaks', () => {
    const on = handlers()
    const stop = connect('s1', on)
    last().send('online', { online: 0 })
    // A proxy holds everything back: no ping, no count.
    vi.advanceTimersByTime(25_000)
    expect(on.up).toHaveBeenLastCalledWith(false)
    expect(FakeSource.all).toHaveLength(2) // opened again
    expect(FakeSource.all[0].readyState).toBe(FakeSource.CLOSED)
    expect(on.refetch).toHaveBeenCalledOnce() // at once, for what it missed
    vi.advanceTimersByTime(15_000)
    expect(on.refetch).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(15_000)
    expect(on.refetch).toHaveBeenCalledTimes(3)
    last().send('ping', {})
    expect(on.up).toHaveBeenLastCalledWith(true)
    vi.advanceTimersByTime(20_000)
    expect(on.refetch).toHaveBeenCalledTimes(3)
    stop()
  })

  it('polls on an error and opens a closed stream again', () => {
    const on = handlers()
    const stop = connect('s1', on)
    last().fail(true)
    expect(on.up).toHaveBeenLastCalledWith(false)
    expect(on.refetch).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(5000)
    expect(FakeSource.all).toHaveLength(2)
    vi.advanceTimersByTime(10_000)
    expect(on.refetch).toHaveBeenCalledTimes(2)
    stop()
  })

  it('refetches and reconnects when the tab is shown again', () => {
    const on = handlers()
    const stop = connect('s1', on)
    last().send('ping', {})
    last().readyState = 0 // died quietly while hidden
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(on.refetch).toHaveBeenCalledOnce()
    expect(FakeSource.all).toHaveLength(2)
    ;(globalThis.window as EventTarget).dispatchEvent(new Event('online'))
    expect(FakeSource.all).toHaveLength(3)
    stop()
    vi.advanceTimersByTime(60_000)
    expect(on.refetch).toHaveBeenCalledOnce()
  })
})

describe('onlineNow', () => {
  it('takes the stream, the polled report while the stream is stuck', () => {
    expect(onlineNow({ online: 3, stale: false }, 1, 5)).toBe(3)
    expect(onlineNow({ online: null, stale: false }, 1, 5)).toBe(1)
    expect(onlineNow({ online: 3, stale: true }, 1, 5)).toBe(5)
    expect(onlineNow({ online: 3, stale: true }, 1, undefined)).toBe(3)
  })

  it('never lets an older polled count replace a newer stream count', () => {
    // the stream said 18 at 5000 and blipped; the poll was read at 4000
    expect(onlineNow({ online: 18, stale: true, at: 5000 }, 19, 19, 4000)).toBe(18)
    expect(onlineNow({ online: 18, stale: true, at: 5000 }, 19, 19, 6000)).toBe(19)
  })
})
