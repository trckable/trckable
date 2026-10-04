// The AI & Search tab's numbers, for the dashboard's period and filters: one
// request, again when either changes or when something it counts was switched on.
import { useCallback, useEffect, useState } from 'react'
import { type AiSearchReport, type ReportQuery, more } from '../../lib/apiMore'

/** `undefined` while it loads, `null` when it could not be read. */
export function useAiSearch(site: string, query: ReportQuery, limit: number) {
  const [again, setAgain] = useState(0)
  const [got, setGot] = useState<{ key: string; rep: AiSearchReport | null } | null>(null)
  const key = JSON.stringify([site, query.from, query.to, query.filters ?? [], limit, again])
  useEffect(() => {
    const ac = new AbortController()
    more
      .aiSearch(site, query, limit, ac.signal)
      .then((rep) => setGot({ key, rep }))
      .catch(() => !ac.signal.aborted && setGot({ key, rep: null }))
    return () => ac.abort()
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps -- key is the request's content; query is a new object each render
  const reload = useCallback(() => setAgain((n) => n + 1), [])
  return { rep: got?.key === key ? got.rep : undefined, reload }
}
