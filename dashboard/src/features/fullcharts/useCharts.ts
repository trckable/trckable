// Loads the chart grid for what is on screen, and again when that changes.
// An older answer arriving late is dropped, never drawn over a newer one.
import { useEffect, useState } from 'react'
import { messageOf, type Bucket, type ReportQuery } from '../../lib/api'
import { fetchCharts, type Charts } from './api'

export function useCharts(site: string, query: ReportQuery, bucket: Bucket | undefined) {
  const [data, setData] = useState<{ key: string; charts: Charts } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const key = site + JSON.stringify([query.from, query.to, query.filters, query.testPayments, bucket])
  useEffect(() => {
    const ctl = new AbortController()
    fetchCharts(site, query, bucket, ctl.signal)
      .then((charts) => {
        setData({ key, charts })
        setError(null)
      })
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setError(messageOf(e))
      })
    return () => ctl.abort()
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps -- keyed by content: query is a new object on every render of the dashboard
  return { charts: data?.charts ?? null, stale: !!data && data.key !== key, error }
}
