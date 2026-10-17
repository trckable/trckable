import { useEffect, useRef, type RefObject } from 'react'
import { debounce } from '../lib/live'
import { useLive } from '../lib/useLive'

// A new visit on the stream reloads the report past its cache, with the
// chart's hourly report, once the visits settle for a while and at least every
// half minute while they go on: the numbers of a busy site are never asked for
// every few seconds. A read the stream asks for at once (the stream is stuck,
// the tab is back after a long while) goes straight through.
const SETTLE_MS = 10_000
const MAX_WAIT_MS = 30_000

export function useLiveRefresh(
  siteId: string,
  live: boolean,
  refresh: (skipCache: boolean) => void,
  refreshHours: RefObject<((skipCache: boolean) => void) | undefined>,
) {
  const slow = useRef<ReturnType<typeof debounce>>(undefined)
  const refreshRef = useRef(refresh)
  useEffect(() => {
    refreshRef.current = refresh
  })
  useEffect(() => {
    const d = debounce(
      () => {
        refreshRef.current(true)
        refreshHours.current?.(true)
      },
      SETTLE_MS,
      MAX_WAIT_MS,
    )
    slow.current = d
    return d.cancel
  }, [refreshHours])
  return useLive(siteId, (settled) => {
    if (!live) return
    if (settled) {
      slow.current?.call()
      return
    }
    refresh(true)
    refreshHours.current?.(true)
  })
}
