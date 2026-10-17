import { useEffect, useRef } from 'react'

/**
 * Calls `run` every `ms` while the tab is shown. A hidden tab makes no calls
 * at all; when it is shown again `run` is called once at once (unless
 * `onShow` is false: the caller already reads on its own then; a number
 * means only when the tab was hidden at least that many ms), and the
 * interval starts over. Returns the stop function.
 */
export function visibleInterval(run: () => void, ms: number, onShow: boolean | number = true): () => void {
  let timer: ReturnType<typeof setInterval> | undefined
  let hiddenAt = 0
  const stop = () => {
    clearInterval(timer)
    timer = undefined
  }
  const start = () => {
    if (!timer) timer = setInterval(run, ms)
  }
  const change = () => {
    if (document.visibilityState !== 'visible') {
      if (!hiddenAt) hiddenAt = Date.now()
      stop()
      return
    }
    const away = hiddenAt ? Date.now() - hiddenAt : 0
    hiddenAt = 0
    if (onShow === true || (typeof onShow === 'number' && away >= onShow)) run()
    start()
  }
  if (document.visibilityState === 'visible') start()
  else hiddenAt = Date.now()
  document.addEventListener('visibilitychange', change)
  return () => {
    stop()
    document.removeEventListener('visibilitychange', change)
  }
}

/** The same for a component: the latest `run` is called, the interval is not restarted by a new function. */
export function useVisibleInterval(run: () => void, ms: number, on = true, onShow: boolean | number = true) {
  const latest = useRef(run)
  useEffect(() => {
    latest.current = run
  })
  useEffect(() => (on ? visibleInterval(() => latest.current(), ms, onShow) : undefined), [ms, on, onShow])
}
