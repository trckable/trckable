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
 * Online now: the stream's count, or the polled report's while the stream is
 * stuck. The stream's count is the server's own, never a guess from visits
 * (a visit from someone already counted would show one too many until the
 * next count). While stuck, the polled count only wins when it was read
 * after the stream's last count: an older one must not replace a newer one.
 */
export function onlineNow(
  stream: { online: number | null; stale: boolean; at?: number },
  shown?: number,
  polled?: number,
  polledAt?: number,
) {
  const newer = stream.online === null || polledAt === undefined || stream.at === undefined || polledAt >= stream.at
  if (stream.stale && polled !== undefined && newer) return polled
  return stream.online ?? shown
}
