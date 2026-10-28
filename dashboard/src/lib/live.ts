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
 * next count). A report read after the stream's last count wins even while
 * the stream looks alive, so a count the stream stopped sending never stays
 * on screen next to a list that moved on; an older one never replaces a newer.
 */
export function onlineNow(
  stream: { online: number | null; stale: boolean; at?: number },
  shown?: number,
  polled?: number,
  polledAt?: number,
) {
  const newer = stream.online === null || polledAt === undefined || stream.at === undefined || polledAt >= stream.at
  if (stream.stale && polled !== undefined && newer) return polled
  if (polled !== undefined && polledAt !== undefined && stream.at !== undefined && polledAt > stream.at) return polled
  return stream.online ?? shown
}
