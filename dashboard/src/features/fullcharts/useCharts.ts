// Loads the chart grid for what is on screen, and again when that changes.
// An older answer arriving late is dropped, never drawn over a newer one.
import { useEffect, useState } from 'react'
import { type Bucket, type ReportQuery } from '../../lib/api'
import { words } from '../../lib/errors'
import { fetchCharts, type Charts } from './api'

// The tabs that read these numbers open one after another: the last answer is kept, so each opens with it.
let last: { key: string; charts: Charts } | null = null

export function useCharts(site: string, query: ReportQuery, bucket: Bucket | undefined) {
  const key = site + JSON.stringify([query.from, query.to, query.filters, query.testPayments, bucket])
  const [data, setData] = useState<{ key: string; charts: Charts } | null>(last?.key === key ? last : null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const ctl = new AbortController()
    fetchCharts(site, query, bucket, ctl.signal)
      .then((charts) => {
        last = { key, charts }
        setData({ key, charts })
        setError(null)
      })
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setError(words(e))
      })
    return () => ctl.abort()
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps -- keyed by content: query is a new object on every render of the dashboard
  return { charts: data?.charts ?? null, stale: !!data && data.key !== key, error }
}
