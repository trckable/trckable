import { useEffect, useRef } from 'react'

/**
 * Calls `run` every `ms` while the tab is shown. A hidden tab makes no calls
 * at all; when it is shown again `run` is called once at once (unless
 * `onShow` is false: the caller already reads on its own then), and the
 * interval starts over. Returns the stop function.
 */
export function visibleInterval(run: () => void, ms: number, onShow = true): () => void {
  let timer: ReturnType<typeof setInterval> | undefined
  const stop = () => {
    clearInterval(timer)
    timer = undefined
  }
  const start = () => {
    if (!timer) timer = setInterval(run, ms)
  }
  const change = () => {
    if (document.visibilityState !== 'visible') {
      stop()
      return
    }
    if (onShow) run()
    start()
  }
  if (document.visibilityState === 'visible') start()
  document.addEventListener('visibilitychange', change)
  return () => {
    stop()
    document.removeEventListener('visibilitychange', change)
  }
}

/** The same for a component: the latest `run` is called, the interval is not restarted by a new function. */
export function useVisibleInterval(run: () => void, ms: number, on = true, onShow = true) {
  const latest = useRef(run)
  useEffect(() => {
    latest.current = run
  })
  useEffect(() => (on ? visibleInterval(() => latest.current(), ms, onShow) : undefined), [ms, on, onShow])
}
