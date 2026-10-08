import { useEffect, useRef, type RefObject } from 'react'
import { useLive } from '../lib/useLive'

// A new visit on the stream reloads the report past its cache, with the
// chart's hourly report. The server may answer a live report up to 2 s behind
// a busy site's commits, so one more refresh follows a few seconds after the
// last visit seen: a quiet site's new visit shows up too.
export function useLiveRefresh(
  siteId: string,
  live: boolean,
  refresh: (skipCache: boolean) => void,
  refreshHours: RefObject<((skipCache: boolean) => void) | undefined>,
) {
  const later = useRef<number | undefined>(undefined)
  const refreshRef = useRef(refresh)
  useEffect(() => { refreshRef.current = refresh })
  useEffect(() => () => window.clearTimeout(later.current), [])
  return useLive(siteId, () => {
    if (!live) return
    refresh(true)
    refreshHours.current?.(true)
    window.clearTimeout(later.current)
    later.current = window.setTimeout(() => {
      refreshRef.current(true)
      refreshHours.current?.(true)
    }, 2500)
  })
}
