import { useEffect, useRef, useState } from 'react'
import { APIError, cachedReport, peekReport, type Report, type ReportQuery } from './api'

/** Fetches a report, keeping the last one on screen while the next loads. */
export function useReport(site: string | null, q: ReportQuery | null, opts: { live?: boolean } = {}) {
  const [data, setData] = useState<Report | null>(() => (site && q ? (peekReport(site, q) ?? null) : null))
  const [error, setError] = useState<string | null>(null)
  // The analytics store can still be opening after a restart. It answers 503
  // and this retries — but a silent retry looks like a hang, so it says so.
  const [warming, setWarming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)
  const key = site && q ? site + JSON.stringify(q) : ''
  const lastKey = useRef('')

  useEffect(() => {
    if (!site || !q) {
      setData(null)
      return
    }
    let cancelled = false
    let retry: ReturnType<typeof setTimeout>
    const load = () => {
      setLoading(true)
      cachedReport(site, q)
        .then((r) => {
          if (cancelled) return
          lastKey.current = key
          setData(r)
          setError(null)
          setWarming(false)
        })
        .catch((e: unknown) => {
          if (cancelled) return
          if (e instanceof APIError && e.status === 503) {
            setWarming(true)
            retry = setTimeout(load, 2000)
          } else setError(e instanceof Error ? e.message : String(e))
        })
        .finally(() => !cancelled && setLoading(false))
    }
    load()
    return () => {
      cancelled = true
      clearTimeout(retry)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick])

  // Ranges that include today refresh every 30 s (the live stream covers the rest).
  useEffect(() => {
    if (!opts.live) return
    const t = setInterval(() => document.visibilityState === 'visible' && setTick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [opts.live])

  return { data, error, warming, loading, stale: loading && lastKey.current !== key, refresh: () => setTick((n) => n + 1) }
}
