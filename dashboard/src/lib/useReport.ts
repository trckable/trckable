import { useEffect, useRef, useState } from 'react'
import { useVisibleInterval } from './visibleInterval'
import { APIError, cachedReport, peekReport, type Report, type ReportQuery } from './api'

/** Fetches a report, keeping the last one on screen while the next loads. A
 *  period read before is shown at once, whatever its age, and refreshed behind
 *  it when it is older than the cache keeps it (lib/api.ts). */
export function useReport(site: string | null, q: ReportQuery | null, opts: { live?: boolean } = {}) {
  const [data, setData] = useState<Report | null>(() => (site && q ? (peekReport(site, q) ?? null) : null))
  const [error, setError] = useState<string | null>(null)
  // The analytics store can still be opening after a restart. It answers 503
  // and this retries — but a silent retry looks like a hang, so it says so.
  const [warming, setWarming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)
  const key = site && q ? site + JSON.stringify(q) : ''
  const [lastKey, setLastKey] = useState('')
  // A refetch asked for because something new arrived skips the 10 s cache.
  const fresh = useRef(false)
  const onScreen = useRef('') // the key of the report on screen
  const reading = useRef<{ key: string; ctl: AbortController }>(undefined)
  useEffect(() => () => reading.current?.ctl.abort(), [key])

  useEffect(() => {
    if (!site || !q) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the report's key changed to nothing; drop the old report with the fetch it came from
      setData(null)
      return
    }
    let cancelled = false
    let retry: ReturnType<typeof setTimeout>
    // One reader per site and period: leaving it cancels the read that is still on its way (below); asking again for the same one (a new visit) shares it.
    if (reading.current?.key !== key || reading.current.ctl.signal.aborted) reading.current = { key, ctl: new AbortController() }
    const { signal } = reading.current.ctl
    const load = () => {
      // Only a read for numbers that are not on screen yet (a new site, period or filter) says it is loading: a read that refreshes what is shown (a visit, the clock, the tab shown again) is silent.
      if (onScreen.current !== key) setLoading(true)
      const maxAge = fresh.current ? 0 : undefined
      fresh.current = false
      const seen = peekReport(site, q)
      if (seen) {
        onScreen.current = key
        setLastKey(key)
        setData(seen)
        setError(null)
      }
      cachedReport(site, q, maxAge, signal)
        .then((r) => {
          if (cancelled) return
          onScreen.current = key
          setLastKey(key)
          setData(r)
          setError(null)
          setWarming(false)
        })
        .catch((e: unknown) => {
          if (cancelled) return
          if (e instanceof APIError && e.status === 503) {
            setWarming(true)
            retry = setTimeout(load, 2000)
          } else {
            // The words for a failure are their own chunk (lib/errors.ts), fetched now; if that fails too, the plainest line.
            void import('./errors').then((m) => setError(m.words(e)), () => setError('Something went wrong'))
          }
        })
        .finally(() => !cancelled && setLoading(false))
    }
    load()
    return () => {
      cancelled = true
      clearTimeout(retry)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key is site + q's content; q is a new object each render and would refetch every time
  }, [key, tick])

  // Ranges that include today refresh every 30 s (the live stream covers the rest).
  useVisibleInterval(() => setTick((n) => n + 1), 30_000, !!opts.live)

  return { data, error, warming, loading, stale: loading && lastKey !== key, refresh: (skipCache = false) => {
    fresh.current = skipCache
    setTick((n) => n + 1)
  } }
}
