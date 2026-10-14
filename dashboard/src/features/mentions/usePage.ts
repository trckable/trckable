// The Mentions page's two extra reads: every row's curve in one call, and one
// mention's detail. A failed read leaves the page as it was.
import { useEffect, useState } from 'react'
import { mentionsApi, type Curves, type Detail, type Period } from './api'

export function useCurves(site: string, period: Period, ready: boolean): Record<string, number[]> {
  const [got, setGot] = useState<{ key: string; curves: Curves['curves'] } | null>(null)
  useEffect(() => {
    if (!ready) return
    const c = new AbortController()
    mentionsApi
      .curves(site, period, c.signal)
      .then((r) => !c.signal.aborted && setGot({ key: site + period, curves: r.curves }))
      .catch(() => undefined)
    return () => c.abort()
  }, [site, period, ready])
  return got?.key === site + period ? got.curves : {}
}

export type DetailState = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; data: Detail }

export function useDetail(site: string, id: number): DetailState {
  const [got, setGot] = useState<{ id: number; data: Detail } | 'failed' | null>(null)
  useEffect(() => {
    const c = new AbortController()
    mentionsApi
      .detail(site, id, c.signal)
      .then((data) => !c.signal.aborted && setGot({ id, data }))
      .catch(() => !c.signal.aborted && setGot('failed'))
    return () => c.abort()
  }, [site, id])
  if (got === 'failed') return { state: 'failed' }
  return got && got.id === id ? { state: 'ready', data: got.data } : { state: 'loading' }
}
