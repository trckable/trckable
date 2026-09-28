// The live stream's small pieces of logic, kept apart from React so they can
// be tested with fake timers.

/** Calls onStale when kick has not been called for ms. */
export function watchdog(ms: number, onStale: () => void) {
  let t: ReturnType<typeof setTimeout> | undefined
  const stop = () => clearTimeout(t)
  const kick = () => {
    stop()
    t = setTimeout(onStale, ms)
  }
  return { kick, stop }
}

/** Runs fn once calls stop for ms, and at least every max while they go on. */
export function debounce(fn: () => void, ms: number, max: number) {
  let t: ReturnType<typeof setTimeout> | undefined
  let first = 0
  const cancel = () => {
    clearTimeout(t)
    first = 0
  }
  const run = () => {
    cancel()
    fn()
  }
  const call = () => {
    const now = Date.now()
    if (!first) first = now
    clearTimeout(t)
    t = setTimeout(run, Math.max(0, Math.min(ms, first + max - now)))
  }
  return { call, cancel }
}

/**
 * Online now: the server's count, plus the visitors the stream has shown
 * since that count who were not seen in the five minutes before it. The
 * server recounts right after a visit, so the bump lasts a moment.
 */
export class OnlineCount {
  server: number | null = null
  private seen = new Map<string, number>()
  private fresh = new Set<string>()

  count(n: number) {
    this.server = n
    this.fresh.clear()
  }

  visit(visitor: string, at: number) {
    const last = this.seen.get(visitor)
    this.seen.set(visitor, at)
    if (last === undefined || at - last > 300_000) this.fresh.add(visitor)
  }

  get value(): number | null {
    if (this.server === null && !this.fresh.size) return null
    return (this.server ?? 0) + this.fresh.size
  }
}

/** Online now: the stream's count, or the polled report's while the stream is stuck. */
export function onlineNow(stream: { online: number | null; stale: boolean }, shown?: number, polled?: number) {
  if (stream.stale && polled !== undefined) return polled
  return stream.online ?? shown
}
