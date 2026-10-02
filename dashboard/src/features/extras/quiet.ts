// The chart's extras (moments, pace) are garnish: they ask the server for their
// numbers only once the page has been quiet, so they never take a slot among the
// requests the first load needs. The first time, that is when the browser is idle
// and a moment more; after that (a new period, a filter) the page is already up and
// they go at the next idle. Pure enough to test: quiet.test.ts.

export const QUIET_MS = 2000

let settled = false

/** Runs `fn` when the page is quiet; the returned function cancels it. */
export function whenQuiet(fn: () => void, wait = QUIET_MS): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let idle: number | undefined
  const run = () => {
    settled = true
    fn()
  }
  const go = () => {
    if (settled) run()
    else timer = setTimeout(run, wait)
  }
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) idle = window.requestIdleCallback(go, { timeout: 3000 })
  else timer = setTimeout(go, 0)
  return () => {
    if (idle !== undefined) window.cancelIdleCallback(idle)
    clearTimeout(timer)
  }
}

/** For tests: forget that a first quiet time has passed. */
export const forgetSettled = () => {
  settled = false
}
